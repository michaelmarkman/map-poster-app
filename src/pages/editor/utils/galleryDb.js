// IndexedDB helpers for the gallery. Full-res PNGs live here so we don't
// blow out localStorage. Lifted from prototypes/poster-v3-ui.jsx.

const GALLERY_DB = 'vedute_gallery'
const LEGACY_GALLERY_DB = 'mapposter_gallery'
const GALLERY_STORE = 'images'

// Open the new vedute DB, creating the object store on first run.
function openDB(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1)
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

// IDB rename can't be atomic — the migration copies entries from the old
// DB to the new one, then deletes the old. Idempotent: runs once per
// session via the cached promise. If the legacy DB is empty / missing,
// the work is essentially free.
let migrationPromise = null
async function migrateLegacyGallery() {
  if (typeof indexedDB === 'undefined') return
  // Fast path: if the new DB already has any rows, the migration ran
  // (or the user only ever used the new build) — skip the legacy probe.
  try {
    const newDb = await openDB(GALLERY_DB)
    const newRows = await new Promise((resolve) => {
      const tx = newDb.transaction(GALLERY_STORE, 'readonly')
      const req = tx.objectStore(GALLERY_STORE).count()
      req.onsuccess = () => resolve(req.result || 0)
      req.onerror = () => resolve(0)
    })
    newDb.close()
    if (newRows > 0) {
      await deleteLegacyDB()
      return
    }
  } catch {
    // Continue to the legacy probe even if the new DB read failed.
  }
  // Read everything out of the legacy DB.
  let legacyRows = []
  try {
    const oldDb = await openDB(LEGACY_GALLERY_DB)
    legacyRows = await new Promise((resolve) => {
      const tx = oldDb.transaction(GALLERY_STORE, 'readonly')
      const req = tx.objectStore(GALLERY_STORE).getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => resolve([])
    })
    oldDb.close()
  } catch {
    return
  }
  if (legacyRows.length === 0) {
    await deleteLegacyDB()
    return
  }
  // Copy into the new DB.
  try {
    const newDb = await openDB(GALLERY_DB)
    await new Promise((resolve) => {
      const tx = newDb.transaction(GALLERY_STORE, 'readwrite')
      const store = tx.objectStore(GALLERY_STORE)
      for (const row of legacyRows) store.put(row)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
    newDb.close()
  } catch (e) {
    console.warn('[gallery] migration write failed:', e)
    return
  }
  await deleteLegacyDB()
}

function deleteLegacyDB() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(LEGACY_GALLERY_DB)
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      req.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
}

function openGalleryDB() {
  if (!migrationPromise) migrationPromise = migrateLegacyGallery()
  return migrationPromise.then(() => openDB(GALLERY_DB))
}

// Returns entries sorted oldest-first; callers that want newest-first should reverse.
// Each entry: { id, label, filename, dataUrl, time (Date), batchId, batchLabel,
//               view, isPublic, rawSnapshot?, prompt?, modifiers? }
//
// `rawSnapshot` is the pre-AI photogrammetry frame (a data: URL). Lets the
// lightbox show the underlying scene via the Raw / Compare toolbar modes.
// `prompt` is the full composed prompt sent to Gemini for AI renders.
// `modifiers` is the array of active modifier keys at dispatch time
// (e.g. ['bustling', 'birds']). All three are null on legacy entries +
// non-AI (raw export) entries — UI gracefully degrades.
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
        // "Capture" fields — group of variants sharing one view+graphics.
        // Reuses batchId as the grouping key; baseImage / graphicsJSON
        // let the lightbox show the un-composited result and re-edit
        // the overlay later.
        baseImage: r.baseImage || null,
        graphicsJSON: r.graphicsJSON || null,
        // Phase 7.2 — public-flag (default false). When Supabase
        // gallery_entries lands, this maps to is_public; today the flag
        // is local-only and just drives the community page filter.
        isPublic: !!r.isPublic,
        // Lightbox Raw / Compare toolbar + prompt panel. Null on legacy
        // entries (saved before this commit) + non-AI entries (raw
        // exports). UI hides the toolbar / chips / prompt block when
        // these are null.
        rawSnapshot: r.rawSnapshot || null,
        prompt: r.prompt || null,
        modifiers: Array.isArray(r.modifiers) ? r.modifiers : null,
      }))
      .sort((a, b) => a.time - b.time)
  } catch (e) {
    return []
  }
}

// Patch a single field on an existing entry. Used by the public-toggle
// in the gallery card; survives the Supabase migration as long as the
// caller keeps the field name in sync with the server schema.
export async function updateGalleryEntry(id, patch) {
  try {
    const db = await openGalleryDB()
    const tx = db.transaction(GALLERY_STORE, 'readwrite')
    const store = tx.objectStore(GALLERY_STORE)
    const cur = await new Promise((resolve) => {
      const req = store.get(id)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    })
    if (!cur) return
    store.put({ ...cur, ...patch })
  } catch (e) {
    console.warn('[gallery] IndexedDB update failed:', e)
  }
}

export async function deleteGalleryEntry(id) {
  try {
    const db = await openGalleryDB()
    const tx = db.transaction(GALLERY_STORE, 'readwrite')
    tx.objectStore(GALLERY_STORE).delete(id)
  } catch (e) {}
}

// Persist a single gallery entry. Port of `saveToGalleryDB` (prototype 2022).
// Time is stored as ISO string; caller passes a Date.
//
// `baseImage` and `graphicsJSON` are vestigial from the deleted graphics
// editor (Phase 1.3). They were the un-composited render + Fabric overlay
// state that the editor's "re-edit graphics" flow rehydrated from. With
// the editor gone, no consumer reads them. New writes drop them — we
// were duplicating a full PNG dataURL per AI render into IDB for nothing.
// Reads (loadGalleryEntries above) still tolerate them for backward
// compat with entries written before this change.
export async function saveGalleryEntry(item) {
  try {
    const db = await openGalleryDB()
    const tx = db.transaction(GALLERY_STORE, 'readwrite')
    tx.objectStore(GALLERY_STORE).put({
      id: item.id,
      label: item.label,
      filename: item.filename,
      dataUrl: item.dataUrl,
      time: item.time instanceof Date ? item.time.toISOString() : item.time,
      batchId: item.batchId || null,
      batchLabel: item.batchLabel || null,
      view: item.view || null,
      isPublic: !!item.isPublic,
      // Lightbox prompt + Raw / Compare data — see loadGalleryEntries
      // for shape notes. Null-safe for non-AI / legacy entries.
      rawSnapshot: item.rawSnapshot || null,
      prompt: item.prompt || null,
      modifiers: Array.isArray(item.modifiers) ? item.modifiers : null,
    })
  } catch (e) {
    console.warn('[gallery] IndexedDB save failed:', e)
  }
}

// Build a gallery entry from the raw (label, filename, dataUrl, opts) signature
// used by the prototype's `addToGallery` (2157). Keeps id/time generation in
// one place so the hook and any future direct callers stay in sync.
export function buildGalleryItem(label, filename, dataUrl, opts = {}) {
  return {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    label,
    filename,
    dataUrl,
    time: new Date(),
    batchId: opts.batchId || null,
    batchLabel: opts.batchLabel || null,
    view: opts.view || null,
    // Lightbox toolbar + prompt panel data. AI renders carry all three;
    // non-AI (raw export) entries carry rawSnapshot === dataUrl plus
    // null prompt + null modifiers. Lightbox.jsx hides Raw/Compare
    // when rawSnapshot is null OR rawSnapshot === dataUrl (no diff to
    // show).
    rawSnapshot: opts.rawSnapshot || null,
    prompt: opts.prompt || null,
    modifiers: Array.isArray(opts.modifiers) ? opts.modifiers : null,
  }
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
