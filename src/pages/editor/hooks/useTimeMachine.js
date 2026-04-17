import { useEffect } from 'react'

// Time Machine data hook (Phase 5 skeleton).
//
// Produces the 'time-machine-*' events consumed by TimeMachineModal and
// persists rendered decades to IndexedDB so the modal can replay the last
// set on reopen. The actual rendering pipeline (camera animation + Gemini
// research + export-queue jobs) lives in Phase 7+; for now this hook wires
// the persistence layer and the open-modal replay path.
//
// IDB layout:
//   DB:    'timeMachine'
//   Store: 'timeMachineSets' (keyPath: 'setId')
//   Value: { setId, entries: { [decade]: { decade, dataUrl, blurb, location } } }
//
// localStorage tracks the most recent setId so replay on 'open-time-machine'
// knows which record to load.

const DB_NAME = 'timeMachine'
const STORE_NAME = 'timeMachineSets'
const CURRENT_SET_KEY = 'mapposter3d_tm_current_set'

// Decades rendered by Time Machine. Mirrors prototypes/poster-v3-ui.jsx and
// the modal's own DECADES constant.
const DECADES = [1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'setId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function readSet(setId) {
  try {
    const db = await openDB()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(setId)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => resolve(null)
    })
  } catch (e) {
    return null
  }
}

async function writeSet(record) {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(record)
  } catch (e) {
    console.warn('[timeMachine] IndexedDB save failed:', e)
  }
}

function getCurrentSetId() {
  try { return localStorage.getItem(CURRENT_SET_KEY) } catch (e) { return null }
}

function setCurrentSetId(setId) {
  try { localStorage.setItem(CURRENT_SET_KEY, String(setId)) } catch (e) {}
}

// Replay persisted entries by firing image events for each decade. The modal
// merges them into its local state exactly as if they had streamed in live.
function replaySet(record) {
  if (!record || !record.entries) return 0
  const entries = record.entries
  let count = 0
  for (const decade of DECADES) {
    const entry = entries[decade]
    if (!entry) continue
    count += 1
    window.dispatchEvent(new CustomEvent('time-machine-image', {
      detail: {
        decade: entry.decade ?? decade,
        dataUrl: entry.dataUrl,
        blurb: entry.blurb,
        location: entry.location,
      },
    }))
  }
  if (count > 0) {
    window.dispatchEvent(new CustomEvent('time-machine-progress', {
      detail: { count, total: DECADES.length },
    }))
  }
  return count
}

// Load a persisted set and replay its events. Returns the entry count replayed
// (0 if the set is missing or empty).
export async function loadSet(setId) {
  if (setId == null) return 0
  const record = await readSet(setId)
  return replaySet(record)
}

// Persist one decade's output and dispatch live events so the modal updates
// in-place. Merges with any prior entry for the same decade so partial updates
// (e.g. blurb arrives before dataUrl) are preserved.
export async function saveJob(setId, decade, dataUrl, blurb, location) {
  if (setId == null || decade == null) return
  const existing = (await readSet(setId)) || { setId, entries: {} }
  const prev = existing.entries[decade] || {}
  const merged = {
    decade,
    dataUrl: dataUrl !== undefined ? dataUrl : prev.dataUrl,
    blurb: blurb !== undefined ? blurb : prev.blurb,
    location: location !== undefined ? location : prev.location,
  }
  existing.entries[decade] = merged
  await writeSet(existing)
  setCurrentSetId(setId)

  window.dispatchEvent(new CustomEvent('time-machine-image', {
    detail: {
      decade,
      dataUrl: merged.dataUrl,
      blurb: merged.blurb,
      location: merged.location,
    },
  }))
  const count = Object.values(existing.entries).filter((e) => e.dataUrl).length
  window.dispatchEvent(new CustomEvent('time-machine-progress', {
    detail: { count, total: DECADES.length },
  }))
}

// React hook: listen for 'open-time-machine' and replay the last persisted set.
// If nothing has been rendered yet, surface a friendly empty-state status so
// the modal isn't stuck on "Rendering decades…".
export default function useTimeMachine() {
  useEffect(() => {
    const onOpen = async () => {
      const setId = getCurrentSetId()
      if (!setId) {
        window.dispatchEvent(new CustomEvent('time-machine-status', {
          detail: 'No renders yet — queue some from the Export panel.',
        }))
        return
      }
      const replayed = await loadSet(setId)
      if (replayed === 0) {
        window.dispatchEvent(new CustomEvent('time-machine-status', {
          detail: 'No renders yet — queue some from the Export panel.',
        }))
      }
    }
    window.addEventListener('open-time-machine', onOpen)
    return () => window.removeEventListener('open-time-machine', onOpen)
  }, [])
}
