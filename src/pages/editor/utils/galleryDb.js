// IndexedDB helpers for the gallery. Full-res PNGs live here so we don't
// blow out localStorage. Lifted from prototypes/poster-v3-ui.jsx.

const GALLERY_DB = 'mapposter_gallery'
const GALLERY_STORE = 'images'

function openGalleryDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(GALLERY_DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(GALLERY_STORE)) {
        db.createObjectStore(GALLERY_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// Returns entries sorted oldest-first; callers that want newest-first should reverse.
// Each entry: { id, label, filename, dataUrl, time (Date), batchId, batchLabel, view }
export async function loadGalleryEntries() {
  try {
    const db = await openGalleryDB()
    const rows = await new Promise((resolve) => {
      const tx = db.transaction(GALLERY_STORE, 'readonly')
      const req = tx.objectStore(GALLERY_STORE).getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => resolve([])
    })
    return rows
      .map((r) => ({
        id: r.id,
        label: r.label,
        filename: r.filename,
        dataUrl: r.dataUrl,
        time: new Date(r.time),
        batchId: r.batchId || null,
        batchLabel: r.batchLabel || null,
        view: r.view || null,
      }))
      .sort((a, b) => a.time - b.time)
  } catch (e) {
    return []
  }
}

export async function deleteGalleryEntry(id) {
  try {
    const db = await openGalleryDB()
    const tx = db.transaction(GALLERY_STORE, 'readwrite')
    tx.objectStore(GALLERY_STORE).delete(id)
  } catch (e) {}
}

// Group gallery into display entries: standalone items or batches.
// Returns { type: 'item', item, idx } or { type: 'batch', batchId, label, items: [{item, idx}], time }
export function buildGalleryEntries(gallery) {
  const batches = new Map()
  const entries = []
  gallery.forEach((item, idx) => {
    if (item.batchId) {
      if (!batches.has(item.batchId)) {
        const entry = {
          type: 'batch',
          batchId: item.batchId,
          label: item.batchLabel || 'Batch',
          items: [],
          time: item.time,
        }
        batches.set(item.batchId, entry)
        entries.push(entry)
      }
      const batch = batches.get(item.batchId)
      batch.items.push({ item, idx })
      if (item.time > batch.time) batch.time = item.time
    } else {
      entries.push({ type: 'item', item, idx })
    }
  })
  // Newest first
  entries.reverse()
  return entries
}
