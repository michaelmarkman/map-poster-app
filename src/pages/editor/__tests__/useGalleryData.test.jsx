import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { galleryEntriesAtom } from '../atoms/gallery'

// Mock at the module boundary so we don't hit IndexedDB.
const mocks = {
  loadGalleryEntries: vi.fn(() => Promise.resolve([])),
  saveGalleryEntry: vi.fn(() => Promise.resolve()),
  deleteGalleryEntry: vi.fn(() => Promise.resolve()),
  updateGalleryEntry: vi.fn(() => Promise.resolve()),
}
vi.mock('../utils/galleryDb', async () => {
  const real = await vi.importActual('../utils/galleryDb')
  return {
    ...real,
    loadGalleryEntries: (...a) => mocks.loadGalleryEntries(...a),
    saveGalleryEntry: (...a) => mocks.saveGalleryEntry(...a),
    deleteGalleryEntry: (...a) => mocks.deleteGalleryEntry(...a),
    updateGalleryEntry: (...a) => mocks.updateGalleryEntry(...a),
    // buildGalleryItem stays real — it's pure, and the hook returns
    // its output unchanged.
  }
})

import useGalleryData from '../hooks/useGalleryData'

function withStore(initial = []) {
  const store = createStore()
  store.set(galleryEntriesAtom, initial)
  return store
}

function wrapper(store) {
  return function Wrapper({ children }) {
    return <Provider store={store}>{children}</Provider>
  }
}

describe('useGalleryData', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset())
    mocks.loadGalleryEntries.mockResolvedValue([])
    mocks.saveGalleryEntry.mockResolvedValue()
    mocks.deleteGalleryEntry.mockResolvedValue()
    mocks.updateGalleryEntry.mockResolvedValue()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('hydrates galleryEntriesAtom from IDB on mount', async () => {
    mocks.loadGalleryEntries.mockResolvedValueOnce([
      { id: 'a', label: 'A', dataUrl: 'data:a', time: new Date(), isPublic: false },
    ])
    const store = withStore()
    renderHook(() => useGalleryData(), { wrapper: wrapper(store) })
    await waitFor(() => {
      expect(store.get(galleryEntriesAtom)).toHaveLength(1)
    })
  })

  it('addEntry pushes to atom + persists in background', async () => {
    const store = withStore()
    const { result } = renderHook(() => useGalleryData(), { wrapper: wrapper(store) })
    // Wait for the initial hydration to settle so it doesn't race with our
    // addEntry call (loadGalleryEntries resolves async and would otherwise
    // override our pushed entry with the empty mock result).
    await waitFor(() => expect(mocks.loadGalleryEntries).toHaveBeenCalled())
    await act(async () => {
      await result.current.addEntry('Tokyo', 'vedute-tokyo', 'data:img', { batchId: null })
    })
    const entries = store.get(galleryEntriesAtom)
    expect(entries).toHaveLength(1)
    expect(entries[0].label).toBe('Tokyo')
    expect(mocks.saveGalleryEntry).toHaveBeenCalled()
  })

  it('deleteEntry removes from atom + IDB', async () => {
    const store = withStore([
      { id: 'a', label: 'A', dataUrl: 'data:a', time: new Date(), isPublic: false },
      { id: 'b', label: 'B', dataUrl: 'data:b', time: new Date(), isPublic: false },
    ])
    const { result } = renderHook(() => useGalleryData(), { wrapper: wrapper(store) })
    // Wait for the initial hydration to settle (loadGalleryEntries returns [])
    await waitFor(() => expect(mocks.loadGalleryEntries).toHaveBeenCalled())
    // Re-seed the atom because hydration overrode it
    act(() => store.set(galleryEntriesAtom, [
      { id: 'a', label: 'A', dataUrl: 'data:a', time: new Date(), isPublic: false },
      { id: 'b', label: 'B', dataUrl: 'data:b', time: new Date(), isPublic: false },
    ]))
    await act(async () => {
      await result.current.deleteEntry('a')
    })
    const entries = store.get(galleryEntriesAtom)
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('b')
    expect(mocks.deleteGalleryEntry).toHaveBeenCalledWith('a')
  })

  it('setPublic flips isPublic in atom + IDB', async () => {
    const store = withStore()
    const { result } = renderHook(() => useGalleryData(), { wrapper: wrapper(store) })
    await waitFor(() => expect(mocks.loadGalleryEntries).toHaveBeenCalled())
    act(() => store.set(galleryEntriesAtom, [
      { id: 'a', label: 'A', dataUrl: 'data:a', time: new Date(), isPublic: false },
    ]))
    await act(async () => {
      await result.current.setPublic('a', true)
    })
    expect(store.get(galleryEntriesAtom)[0].isPublic).toBe(true)
    expect(mocks.updateGalleryEntry).toHaveBeenCalledWith('a', { isPublic: true })
  })

  it('listens to gallery-add window event and adds the entry', async () => {
    const store = withStore()
    renderHook(() => useGalleryData(), { wrapper: wrapper(store) })
    await waitFor(() => expect(mocks.loadGalleryEntries).toHaveBeenCalled())
    await act(async () => {
      window.dispatchEvent(new CustomEvent('gallery-add', {
        detail: { label: 'Paris', filename: 'p', dataUrl: 'data:p', opts: {} },
      }))
      await Promise.resolve()
    })
    expect(store.get(galleryEntriesAtom).some((e) => e.label === 'Paris')).toBe(true)
  })

  it('listens to gallery-remove (alias) and removes', async () => {
    const store = withStore()
    const { rerender } = renderHook(() => useGalleryData(), { wrapper: wrapper(store) })
    rerender()
    act(() => store.set(galleryEntriesAtom, [
      { id: 'x', label: 'X', dataUrl: 'data:x', time: new Date(), isPublic: false },
    ]))
    await act(async () => {
      window.dispatchEvent(new CustomEvent('gallery-remove', { detail: { id: 'x' } }))
      await Promise.resolve()
    })
    expect(store.get(galleryEntriesAtom)).toHaveLength(0)
  })

  it('listens to gallery-toggle-public', async () => {
    const store = withStore()
    renderHook(() => useGalleryData(), { wrapper: wrapper(store) })
    await waitFor(() => expect(mocks.loadGalleryEntries).toHaveBeenCalled())
    act(() => store.set(galleryEntriesAtom, [
      { id: 'a', label: 'A', dataUrl: 'data:a', time: new Date(), isPublic: false },
    ]))
    await act(async () => {
      window.dispatchEvent(new CustomEvent('gallery-toggle-public', {
        detail: { id: 'a', isPublic: true },
      }))
      await Promise.resolve()
    })
    expect(store.get(galleryEntriesAtom)[0].isPublic).toBe(true)
  })

  it('cleans up window listeners on unmount', () => {
    const types = ['gallery-add', 'gallery-remove', 'gallery-toggle-public', 'gallery-download-all']
    const counts = Object.fromEntries(types.map((t) => [t, { added: 0, removed: 0 }]))
    const realAdd = window.addEventListener
    const realRemove = window.removeEventListener
    window.addEventListener = function (type, ...rest) {
      if (counts[type]) counts[type].added++
      return realAdd.call(this, type, ...rest)
    }
    window.removeEventListener = function (type, ...rest) {
      if (counts[type]) counts[type].removed++
      return realRemove.call(this, type, ...rest)
    }
    try {
      const store = withStore()
      const { unmount } = renderHook(() => useGalleryData(), { wrapper: wrapper(store) })
      unmount()
      for (const t of types) {
        expect(counts[t].added, t).toBe(counts[t].removed)
      }
    } finally {
      window.addEventListener = realAdd
      window.removeEventListener = realRemove
    }
  })
})
