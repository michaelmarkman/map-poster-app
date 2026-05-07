import { useCallback, useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { galleryEntriesAtom } from '../atoms/gallery'
import {
  loadGalleryEntries,
  deleteGalleryEntry,
  saveGalleryEntry,
  updateGalleryEntry,
  buildGalleryItem,
} from '../utils/galleryDb'

// Gallery data layer. Hydrates galleryEntriesAtom from IndexedDB on mount and
// exposes add/delete/refresh. Also listens to window events (gallery-add,
// gallery-remove, gallery-toggle-public, gallery-download-all) so the queue
// + gallery card + community page can interact with the gallery without
// holding a hook reference.
//
// Ports:
//   - openGalleryDB      prototypes/poster-v3-ui.jsx:2008  (via galleryDb util)
//   - saveToGalleryDB    prototypes/poster-v3-ui.jsx:2022  -> saveGalleryEntry
//   - loadGalleryDB      prototypes/poster-v3-ui.jsx:2039  -> loadGalleryEntries
//   - deleteFromGalleryDB prototypes/poster-v3-ui.jsx:2051 -> deleteGalleryEntry
//   - addToGallery       prototypes/poster-v3-ui.jsx:2157  -> addEntry below
export default function useGalleryData() {
  const setEntries = useSetAtom(galleryEntriesAtom)

  const refresh = useCallback(async () => {
    const items = await loadGalleryEntries()
    setEntries(items)
  }, [setEntries])

  const addEntry = useCallback(
    async (label, filename, dataUrl, opts = {}) => {
      const item = buildGalleryItem(label, filename, dataUrl, opts)
      // Update atom synchronously so the UI badge / gallery modal reflect the
      // new entry immediately; persist in the background.
      setEntries((cur) => [...cur, item])
      saveGalleryEntry(item)
      return item
    },
    [setEntries],
  )

  const deleteEntry = useCallback(
    async (id) => {
      setEntries((cur) => cur.filter((e) => e.id !== id))
      await deleteGalleryEntry(id)
    },
    [setEntries],
  )

  // Phase 7.2 — toggle the local is_public flag. Survives the Supabase
  // swap unchanged: server side just gets the same boolean update.
  const setPublic = useCallback(
    async (id, isPublic) => {
      setEntries((cur) =>
        cur.map((e) => (e.id === id ? { ...e, isPublic: !!isPublic } : e)),
      )
      await updateGalleryEntry(id, { isPublic: !!isPublic })
    },
    [setEntries],
  )

  // Initial hydration.
  useEffect(() => {
    let cancelled = false
    loadGalleryEntries().then((items) => {
      if (!cancelled) setEntries(items)
    })
    return () => {
      cancelled = true
    }
  }, [setEntries])

  // Legacy event bridge — the queue/exporter code (and GalleryModal's Download
  // all button) dispatch these on window. Keep listening so we don't force
  // every caller to switch to calling the hook's methods directly.
  useEffect(() => {
    const onAdd = (e) => {
      const d = e?.detail || {}
      if (!d.dataUrl) return
      addEntry(d.label, d.filename, d.dataUrl, d.opts || {})
    }
    const onDelete = (e) => {
      const id = e?.detail?.id
      if (id != null) deleteEntry(id)
    }
    const onDownloadAll = (e) => {
      // GalleryModal passes the current list via detail.gallery, but we also
      // accept a bare call that falls back to the atom.
      const list = e?.detail?.gallery
      const entries = Array.isArray(list) ? list : null
      const run = (items) => {
        // Browsers throttle anchor.click() downloads when they fire in a
        // tight loop — Chrome silently drops everything after ~10 rapid
        // anchors, Firefox shows a permission prompt. Stagger with a
        // small delay (~150ms) so all the downloads land. Even at 50
        // entries that's only ~7.5s total, perfectly acceptable for a
        // 'Download all' button.
        items.forEach((item, i) => {
          setTimeout(() => {
            const link = document.createElement('a')
            link.download = (item.filename || 'image') + '.png'
            link.href = item.dataUrl
            link.click()
          }, i * 150)
        })
      }
      if (entries) {
        run(entries)
      } else {
        loadGalleryEntries().then(run)
      }
    }
    const onTogglePublic = (e) => {
      const { id, isPublic } = e?.detail || {}
      if (id != null) setPublic(id, !!isPublic)
    }
    window.addEventListener('gallery-add', onAdd)
    window.addEventListener('gallery-remove', onDelete)
    window.addEventListener('gallery-toggle-public', onTogglePublic)
    window.addEventListener('gallery-download-all', onDownloadAll)
    return () => {
      window.removeEventListener('gallery-add', onAdd)
      window.removeEventListener('gallery-remove', onDelete)
      window.removeEventListener('gallery-toggle-public', onTogglePublic)
      window.removeEventListener('gallery-download-all', onDownloadAll)
    }
  }, [addEntry, deleteEntry, setPublic])

  return { addEntry, deleteEntry, setPublic, refresh }
}
