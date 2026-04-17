import { useCallback, useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { galleryEntriesAtom } from '../atoms/gallery'
import {
  loadGalleryEntries,
  deleteGalleryEntry,
  saveGalleryEntry,
  buildGalleryItem,
} from '../utils/galleryDb'

// Gallery data layer. Hydrates galleryEntriesAtom from IndexedDB on mount and
// exposes add/delete/refresh. Also listens to the legacy window events
// (gallery-add, gallery-delete, gallery-download-all) so sidebar/modal/queue
// code that still speaks the prototype's event channel keeps working.
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
        items.forEach((item) => {
          const link = document.createElement('a')
          link.download = (item.filename || 'image') + '.png'
          link.href = item.dataUrl
          link.click()
        })
      }
      if (entries) {
        run(entries)
      } else {
        loadGalleryEntries().then(run)
      }
    }
    window.addEventListener('gallery-add', onAdd)
    window.addEventListener('gallery-delete', onDelete)
    window.addEventListener('gallery-download-all', onDownloadAll)
    return () => {
      window.removeEventListener('gallery-add', onAdd)
      window.removeEventListener('gallery-delete', onDelete)
      window.removeEventListener('gallery-download-all', onDownloadAll)
    }
  }, [addEntry, deleteEntry])

  return { addEntry, deleteEntry, refresh }
}
