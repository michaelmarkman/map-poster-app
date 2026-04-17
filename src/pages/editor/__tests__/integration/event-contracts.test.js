// Integration tests for the custom-event channels between hooks and Scene.
//
// Every time a hook dispatches an event a component listens for, there's an
// implicit protocol: the dispatcher and listener agree on the `detail` shape.
// Unit tests stub each side separately and miss shape mismatches (that's how
// `restore-view` and the `fov-change` formula bug shipped). These tests fire
// the real event and assert both ends agree.
//
// We don't spin up React here — Scene.jsx's listeners aren't pure (they
// touch the camera object). Instead we mirror the listener's logic in a
// tiny fake that matches Scene.jsx's extraction rules, and assert the
// hook's dispatched shape feeds that fake correctly. When Scene's listener
// changes, update the fake in this file too — the diff is intentional.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAtomValue } from 'jotai'
import useSavedViews from '../../hooks/useSavedViews'
import { savedViewsAtom } from '../../atoms/sidebar'

// Scene's restore-view handler, extracted so we can fake the camera side
// without R3F. Any change to Scene.jsx's `restore-view` listener should be
// mirrored here so this test keeps modeling the real contract.
function applyRestoreViewDetail(camera, detail) {
  if (!detail) return
  const v = detail.camera && typeof detail.camera === 'object' ? detail.camera : detail
  if (Array.isArray(v.position) && v.position.length === 3) {
    camera.position = [...v.position]
  }
  if (Array.isArray(v.quaternion) && v.quaternion.length === 4) {
    camera.quaternion = [...v.quaternion]
  }
  if (v.fovMm != null) {
    camera.fov = 2 * Math.atan(12 / v.fovMm) * 180 / Math.PI
  }
}

function mockCameraResponder() {
  const cam = {
    position: [1334901, -4652057, 4140996],
    quaternion: [0.1, 0.2, 0.3, 0.9],
    up: [0.2, -0.7, 0.6],
    latitude: 40.74,
    longitude: -73.98,
    altitude: 500,
    fovMm: 41,
  }
  const handler = (e) => {
    if (typeof e.detail?.resolve === 'function') e.detail.resolve(cam)
  }
  window.addEventListener('get-camera', handler)
  return () => window.removeEventListener('get-camera', handler)
}

describe('saved-view round trip', () => {
  const SESSION_KEY = 'mapposter3d_v2_views'
  const storageBackup = new Map()

  beforeEach(() => {
    storageBackup.clear()
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      storageBackup.set(k, localStorage.getItem(k))
    }
    localStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
    for (const [k, v] of storageBackup) localStorage.setItem(k, v)
  })

  it('save-view stores a view that restore-view consumes correctly', async () => {
    vi.useFakeTimers()
    const detach = mockCameraResponder()
    try {
      renderHook(() => useSavedViews())
      await act(async () => {
        window.dispatchEvent(new CustomEvent('save-view'))
        await Promise.resolve()
        await Promise.resolve()
        vi.runOnlyPendingTimers()
      })
      const { result } = renderHook(() => useAtomValue(savedViewsAtom))
      expect(result.current.length).toBe(1)
      const view = result.current[0]
      expect(view.camera.position).toEqual([1334901, -4652057, 4140996])
      expect(view.camera.fovMm).toBe(41)

      // Now round-trip: dispatching load-view sends this view to Scene via
      // restore-view. Fake the Scene side; verify the camera ends up at the
      // saved position.
      const camera = { position: null, quaternion: null, fov: null }
      const onRestore = (e) => applyRestoreViewDetail(camera, e.detail)
      window.addEventListener('restore-view', onRestore)
      try {
        await act(async () => {
          window.dispatchEvent(new CustomEvent('load-view', { detail: { id: view.id } }))
          await Promise.resolve()
        })
        expect(camera.position).toEqual([1334901, -4652057, 4140996])
        expect(camera.quaternion).toEqual([0.1, 0.2, 0.3, 0.9])
        // Vertical-FOV formula: 2 * atan(12/41) in degrees.
        expect(camera.fov).toBeCloseTo(32.65, 1)
      } finally {
        window.removeEventListener('restore-view', onRestore)
      }
    } finally {
      detach()
      vi.useRealTimers()
    }
  })

  it('restore-view accepts both bare camera and wrapped saved-view shapes', () => {
    const camera = { position: null }
    // Bare shape (session restore path):
    applyRestoreViewDetail(camera, { position: [1, 2, 3] })
    expect(camera.position).toEqual([1, 2, 3])

    // Wrapped shape (saved view path — detail.camera.position):
    applyRestoreViewDetail(camera, { camera: { position: [4, 5, 6] }, tod: 14 })
    expect(camera.position).toEqual([4, 5, 6])
  })
})

describe('fov-change formula contract', () => {
  // syncCameraToUI in utils/camera.js turns camera.fov into a mm value; the
  // FovListener in scene/Controls.jsx inverts it. Saved views' fovMm must
  // feed restore-view and come back out of get-camera as the same mm.
  it('fovMm ↔ vertical fov is a clean roundtrip', () => {
    // mm → fov (vertical-sensor, 24mm full-frame): fov = 2 * atan(12/mm)
    // fov → mm (inverse used by syncCameraToUI):   mm  = 12 / tan(fov/2)
    for (const mm of [14, 35, 41, 85, 135, 200]) {
      const fov = 2 * Math.atan(12 / mm) * 180 / Math.PI
      const back = 12 / Math.tan(fov * Math.PI / 360)
      expect(back).toBeCloseTo(mm, 4)
    }
  })
})

describe('session save debounce contract', () => {
  // Any atom in useSessionPersistence's save-effect deps MUST change slower
  // than the 500ms debounce, or the timer resets perpetually and save never
  // fires (the cameraReadoutAtom bug). This test guards the deps list: if
  // anyone adds a per-frame atom to the save deps, fail loudly.
  it('save deps do not contain cameraReadoutAtom', async () => {
    const { readFile } = await import('node:fs/promises')
    const { resolve } = await import('node:path')
    const code = await readFile(
      resolve(process.cwd(), 'src/pages/editor/hooks/useSessionPersistence.js'),
      'utf8',
    )
    // The save effect's deps array lists every atom whose change should
    // schedule a save. It ends in a `textFields` followed by the closing
    // `]` — find that bracket-form specifically and ensure it does NOT
    // include cameraReadout (the atom churns at ~5Hz, would starve the
    // 500ms debounce if re-added).
    const saveDepsMatch = code.match(/\[\s*timeOfDay[^\]]*\]/)
    expect(saveDepsMatch, 'save-effect deps array not found — regex needs updating').toBeTruthy()
    expect(saveDepsMatch[0]).not.toContain('cameraReadout')
  })
})
