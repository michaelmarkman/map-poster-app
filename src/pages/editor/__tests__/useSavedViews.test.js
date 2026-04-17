import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAtomValue } from 'jotai'
import useSavedViews from '../hooks/useSavedViews'
import { savedViewsAtom } from '../atoms/sidebar'

const VIEWS_KEY = 'mapposter3d_v2_views'

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

// Minimal fake Scene: respond to 'get-camera' with a deterministic camera.
function attachFakeCameraResponder(cam) {
  const handler = (e) => {
    if (e.detail && typeof e.detail.resolve === 'function') {
      e.detail.resolve(cam)
    }
  }
  window.addEventListener('get-camera', handler)
  return () => window.removeEventListener('get-camera', handler)
}

describe('useSavedViews', () => {
  let storage
  beforeEach(() => {
    storage = installMemoryStorage()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('hydrates savedViewsAtom from localStorage on mount', () => {
    const existing = [
      { id: 'abc', name: 'Tokyo', camera: { px: 1, py: 2, pz: 3, qx: 0, qy: 0, qz: 0, qw: 1, fov: 45 }, tod: 14, focalUV: [0.5, 0.5], dofTightness: 60, dofBlur: 30, dofColorPop: 50 },
    ]
    storage.api.setItem(VIEWS_KEY, JSON.stringify(existing))

    renderHook(() => useSavedViews())
    const { result } = renderHook(() => useAtomValue(savedViewsAtom))
    expect(result.current).toHaveLength(1)
    expect(result.current[0].name).toBe('Tokyo')
    expect(result.current[0].id).toBe('abc')
  })

  it('initializes to [] if localStorage is empty', () => {
    renderHook(() => useSavedViews())
    const { result } = renderHook(() => useAtomValue(savedViewsAtom))
    expect(result.current).toEqual([])
  })

  it('initializes to [] if localStorage has invalid JSON', () => {
    storage.api.setItem(VIEWS_KEY, '{not valid')
    renderHook(() => useSavedViews())
    const { result } = renderHook(() => useAtomValue(savedViewsAtom))
    expect(result.current).toEqual([])
  })

  it('initializes to [] if localStorage has a non-array value', () => {
    storage.api.setItem(VIEWS_KEY, JSON.stringify({ foo: 'bar' }))
    renderHook(() => useSavedViews())
    const { result } = renderHook(() => useAtomValue(savedViewsAtom))
    expect(result.current).toEqual([])
  })

  it('save-view adds a new view with auto-derived name and matching serialization shape', async () => {
    vi.useFakeTimers()
    const cam = { px: 6378137, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, fov: 60 }
    const detach = attachFakeCameraResponder(cam)

    renderHook(() => useSavedViews())

    await act(async () => {
      window.dispatchEvent(new CustomEvent('save-view'))
      // Let the promise resolve (microtask).
      await Promise.resolve()
      await Promise.resolve()
    })

    const { result } = renderHook(() => useAtomValue(savedViewsAtom))
    expect(result.current).toHaveLength(1)
    const v = result.current[0]
    // Serialization matches buildSavedViewFromCapture shape.
    expect(typeof v.id).toBe('string')
    expect(v.camera).toEqual(cam)
    expect(v.focalUV).toHaveLength(2)
    expect(typeof v.tod).toBe('number')
    expect('dofTightness' in v).toBe(true)
    expect('dofBlur' in v).toBe(true)
    expect('dofColorPop' in v).toBe(true)
    // Auto-derived name contains degree symbol from coord formatter.
    expect(v.name).toContain('\u00b0')

    // Flush throttled write.
    await act(async () => { vi.runAllTimers() })
    const persisted = JSON.parse(storage.api.getItem(VIEWS_KEY))
    expect(persisted).toHaveLength(1)
    expect(persisted[0].name).toBe(v.name)

    detach()
  })

  it('save-view with {name} detail uses the provided name', async () => {
    vi.useFakeTimers()
    const cam = { px: 1, py: 2, pz: 3, qx: 0, qy: 0, qz: 0, qw: 1, fov: 50 }
    const detach = attachFakeCameraResponder(cam)

    renderHook(() => useSavedViews())
    await act(async () => {
      window.dispatchEvent(new CustomEvent('save-view', { detail: { name: 'My Favorite Spot' } }))
      await Promise.resolve()
      await Promise.resolve()
    })

    const { result } = renderHook(() => useAtomValue(savedViewsAtom))
    expect(result.current[0].name).toBe('My Favorite Spot')

    detach()
  })

  it('delete-view removes the view from atom + storage', async () => {
    vi.useFakeTimers()
    const existing = [
      { id: 'a', name: 'First', camera: { px: 1, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, fov: 45 }, tod: 12, focalUV: [0.5, 0.5], dofTightness: 70, dofBlur: 25, dofColorPop: 60 },
      { id: 'b', name: 'Second', camera: { px: 0, py: 1, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, fov: 45 }, tod: 12, focalUV: [0.5, 0.5], dofTightness: 70, dofBlur: 25, dofColorPop: 60 },
    ]
    storage.api.setItem(VIEWS_KEY, JSON.stringify(existing))

    renderHook(() => useSavedViews())
    await act(async () => {
      window.dispatchEvent(new CustomEvent('delete-view', { detail: { id: 'a' } }))
    })

    const { result } = renderHook(() => useAtomValue(savedViewsAtom))
    expect(result.current).toHaveLength(1)
    expect(result.current[0].id).toBe('b')

    await act(async () => { vi.runAllTimers() })
    const persisted = JSON.parse(storage.api.getItem(VIEWS_KEY))
    expect(persisted).toHaveLength(1)
    expect(persisted[0].id).toBe('b')
  })

  it('delete-view accepts raw id as detail (prototype convention)', async () => {
    vi.useFakeTimers()
    const existing = [
      { id: 'z', name: 'Only', camera: { px: 1, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, fov: 45 }, tod: 12, focalUV: [0.5, 0.5], dofTightness: 70, dofBlur: 25, dofColorPop: 60 },
    ]
    storage.api.setItem(VIEWS_KEY, JSON.stringify(existing))

    renderHook(() => useSavedViews())
    await act(async () => {
      window.dispatchEvent(new CustomEvent('delete-view', { detail: 'z' }))
    })

    const { result } = renderHook(() => useAtomValue(savedViewsAtom))
    expect(result.current).toHaveLength(0)
  })

  it('load-view dispatches restore-view with the full view detail', () => {
    const existing = [
      {
        id: 'xyz',
        name: 'Alpha',
        camera: { px: 10, py: 20, pz: 30, qx: 0.1, qy: 0.2, qz: 0.3, qw: 0.9, fov: 55 },
        tod: 16,
        focalUV: [0.4, 0.6],
        dofTightness: 50,
        dofBlur: 80,
        dofColorPop: 40,
      },
    ]
    storage.api.setItem(VIEWS_KEY, JSON.stringify(existing))

    const restored = []
    const handler = (e) => restored.push(e.detail)
    window.addEventListener('restore-view', handler)

    renderHook(() => useSavedViews())
    act(() => {
      window.dispatchEvent(new CustomEvent('load-view', { detail: { id: 'xyz' } }))
    })

    window.removeEventListener('restore-view', handler)

    expect(restored).toHaveLength(1)
    expect(restored[0].id).toBe('xyz')
    expect(restored[0].camera.fov).toBe(55)
  })

  it('throttles rapid save-views into a single localStorage write', async () => {
    vi.useFakeTimers()
    const cam = { px: 1, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, fov: 45 }
    const detach = attachFakeCameraResponder(cam)

    const setItemSpy = vi.spyOn(storage.api, 'setItem')

    renderHook(() => useSavedViews())
    await act(async () => {
      window.dispatchEvent(new CustomEvent('save-view'))
      await Promise.resolve()
      await Promise.resolve()
      window.dispatchEvent(new CustomEvent('save-view'))
      await Promise.resolve()
      await Promise.resolve()
      window.dispatchEvent(new CustomEvent('save-view'))
      await Promise.resolve()
      await Promise.resolve()
    })

    const writesBeforeFlush = setItemSpy.mock.calls.filter(([k]) => k === VIEWS_KEY).length
    // With throttling, all 3 saves within the 100ms window should not each
    // trigger a write — the timer should still be pending.
    expect(writesBeforeFlush).toBe(0)

    await act(async () => { vi.runAllTimers() })

    const writesAfterFlush = setItemSpy.mock.calls.filter(([k]) => k === VIEWS_KEY).length
    expect(writesAfterFlush).toBe(1)

    detach()
  })

  it('caps saved views at 20 entries (unshift + trim)', async () => {
    vi.useFakeTimers()
    const existing = Array.from({ length: 20 }, (_, i) => ({
      id: 'old-' + i,
      name: 'View ' + i,
      camera: { px: i, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, fov: 45 },
      tod: 12,
      focalUV: [0.5, 0.5],
      dofTightness: 70,
      dofBlur: 25,
      dofColorPop: 60,
    }))
    storage.api.setItem(VIEWS_KEY, JSON.stringify(existing))

    const cam = { px: 999, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, fov: 60 }
    const detach = attachFakeCameraResponder(cam)

    renderHook(() => useSavedViews())
    await act(async () => {
      window.dispatchEvent(new CustomEvent('save-view', { detail: { name: 'Newest' } }))
      await Promise.resolve()
      await Promise.resolve()
    })

    const { result } = renderHook(() => useAtomValue(savedViewsAtom))
    expect(result.current).toHaveLength(20)
    expect(result.current[0].name).toBe('Newest')
    // Oldest entry dropped (old-19 was at index 19, now bumped off).
    expect(result.current.find((v) => v.id === 'old-19')).toBeUndefined()

    detach()
  })
})
