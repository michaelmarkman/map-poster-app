import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAtomValue } from 'jotai'
import useSessionPersistence, { registerCamera } from '../hooks/useSessionPersistence'
import {
  timeOfDayAtom,
  latitudeAtom,
  longitudeAtom,
  sunRotationAtom,
  bloomAtom,
  dofAtom,
  cloudsAtom,
  mapStyleAtom,
  todUnlockedAtom,
} from '../atoms/scene'
import {
  fillModeAtom,
  aspectRatioAtom,
  textOverlayAtom,
  textFieldsAtom,
} from '../atoms/ui'

const SESSION_KEY = 'mapposter3d_poster_v2_session'

// A fake localStorage we can inspect between renders. jsdom provides one, but
// controlling it directly keeps tests deterministic across suites.
function installMemoryStorage() {
  const store = new Map()
  const api = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
    clear: () => { store.clear() },
    get length() { return store.size },
    key: (i) => Array.from(store.keys())[i] ?? null,
  }
  vi.stubGlobal('localStorage', api)
  return { api, store }
}

describe('useSessionPersistence', () => {
  let storage
  beforeEach(() => {
    storage = installMemoryStorage()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('sets atoms from a saved session on mount', () => {
    const saved = {
      camera: { tilt: 42, heading: 33, altitude: 900, fovMm: 50 },
      state: {
        timeOfDay: 14.5,
        latitude: 37.7749,
        longitude: -122.4194,
        sunRotation: 22,
        dof: { on: false, focalUV: [0.4, 0.6], tightness: 30, blur: 50, colorPop: 40, globalPop: true },
        clouds: { on: false, coverage: 0.5, shadows: false, paused: true, speed: 2 },
        bloom: { on: true },
        ssao: { on: true },
        vignette: { on: true },
      },
      ui: {
        fillMode: true,
        aspectRatio: 1.5,
        textOverlay: false,
        textFields: { title: 'SF', subtitle: 'Mission', coords: '37.76° N, 122.42° W' },
        mapStyle: 'noir',
        todUnlocked: true,
      },
      timestamp: 1700000000000,
    }
    storage.api.setItem(SESSION_KEY, JSON.stringify(saved))

    // Mount the hook, then read each atom through a child renderHook.
    renderHook(() => useSessionPersistence())
    const read = renderHook(() => ({
      timeOfDay: useAtomValue(timeOfDayAtom),
      latitude: useAtomValue(latitudeAtom),
      longitude: useAtomValue(longitudeAtom),
      sunRotation: useAtomValue(sunRotationAtom),
      bloom: useAtomValue(bloomAtom),
      dof: useAtomValue(dofAtom),
      clouds: useAtomValue(cloudsAtom),
      mapStyle: useAtomValue(mapStyleAtom),
      todUnlocked: useAtomValue(todUnlockedAtom),
      fillMode: useAtomValue(fillModeAtom),
      aspectRatio: useAtomValue(aspectRatioAtom),
      textOverlay: useAtomValue(textOverlayAtom),
      textFields: useAtomValue(textFieldsAtom),
    }))
    const { result } = read

    expect(result.current.timeOfDay).toBe(14.5)
    expect(result.current.latitude).toBeCloseTo(37.7749)
    expect(result.current.longitude).toBeCloseTo(-122.4194)
    expect(result.current.sunRotation).toBe(22)
    expect(result.current.bloom).toEqual({ on: true })
    expect(result.current.dof.tightness).toBe(30)
    expect(result.current.dof.globalPop).toBe(true)
    expect(result.current.clouds.coverage).toBe(0.5)
    expect(result.current.mapStyle).toBe('noir')
    expect(result.current.todUnlocked).toBe(true)
    expect(result.current.fillMode).toBe(true)
    expect(result.current.aspectRatio).toBe(1.5)
    expect(result.current.textOverlay).toBe(false)
    expect(result.current.textFields.title).toBe('SF')
  })

  it('heals invalid timeOfDay (clamps to 12 if outside [8, 18])', () => {
    const saved = {
      state: { timeOfDay: 0.85 },
    }
    storage.api.setItem(SESSION_KEY, JSON.stringify(saved))

    renderHook(() => useSessionPersistence())
    const { result } = renderHook(() => useAtomValue(timeOfDayAtom))
    expect(result.current).toBe(12)
  })

  it('keeps timeOfDay when already inside the safe daylight range', () => {
    const saved = { state: { timeOfDay: 10 } }
    storage.api.setItem(SESSION_KEY, JSON.stringify(saved))
    renderHook(() => useSessionPersistence())
    const { result } = renderHook(() => useAtomValue(timeOfDayAtom))
    expect(result.current).toBe(10)
  })

  it('mirrors fillMode to body class on restore', () => {
    const saved = { ui: { fillMode: true } }
    storage.api.setItem(SESSION_KEY, JSON.stringify(saved))
    renderHook(() => useSessionPersistence())
    expect(document.body.classList.contains('fill-mode')).toBe(true)
  })

  it('dispatches fov-change when a saved camera is present', async () => {
    vi.useFakeTimers()
    const saved = {
      camera: { tilt: 55, heading: 120, altitude: 600, fovMm: 35 },
      state: { timeOfDay: 12 },
    }
    storage.api.setItem(SESSION_KEY, JSON.stringify(saved))

    const events = []
    const onFov = (e) => events.push({ type: 'fov-change', detail: e.detail })
    window.addEventListener('fov-change', onFov)

    renderHook(() => useSessionPersistence())
    // Only pending timers (not recurring setInterval for the camera poll).
    await act(async () => { vi.runOnlyPendingTimers() })

    window.removeEventListener('fov-change', onFov)

    // Camera position / quaternion / up are restored directly by Scene's
    // useLayoutEffect reading the same session blob — no camera-set event
    // fires from this hook anymore. Only the fov slider still needs a
    // nudge so the Controls hook re-derives DoF tightness on restore.
    const fov = events.find(e => e.type === 'fov-change')
    expect(fov?.detail).toBe(35)
  })

  it('saves immediately on save-session event', () => {
    renderHook(() => useSessionPersistence())
    window.dispatchEvent(new CustomEvent('save-session'))
    const raw = storage.api.getItem(SESSION_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw)
    expect(parsed.state).toBeTruthy()
    expect(parsed.ui).toBeTruthy()
    expect(parsed.camera).toBeTruthy()
    expect(typeof parsed.timestamp).toBe('number')
  })

  it('registerCamera enriches the save payload with position/quaternion/up', () => {
    const fakeCamera = {
      position: { x: 1, y: 2, z: 3 },
      quaternion: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 },
      up: { x: 0, y: 1, z: 0 },
    }
    registerCamera(fakeCamera)
    renderHook(() => useSessionPersistence())
    window.dispatchEvent(new CustomEvent('save-session'))
    const parsed = JSON.parse(storage.api.getItem(SESSION_KEY))
    expect(parsed.camera.position).toEqual([1, 2, 3])
    expect(parsed.camera.quaternion).toEqual([0.1, 0.2, 0.3, 0.9])
    expect(parsed.camera.up).toEqual([0, 1, 0])
    // Reset so later tests aren't affected.
    registerCamera(null)
  })

  it('does not throw on corrupt localStorage', () => {
    storage.api.setItem(SESSION_KEY, '{not valid json')
    expect(() => renderHook(() => useSessionPersistence())).not.toThrow()
  })

  it('no-ops when no saved session exists', () => {
    expect(() => renderHook(() => useSessionPersistence())).not.toThrow()
  })
})
