import { atom } from 'jotai'

// Loaded gallery entries, oldest-first (matches what the prototype's in-memory
// `gallery` array looked like after loadGalleryDB hydration — see
// prototypes/poster-v3-ui.jsx:2060-2079). Each entry:
//   { id, label, filename, dataUrl, time (Date), batchId, batchLabel, view }
// Owned by useGalleryData — other consumers read-only.
export const galleryEntriesAtom = atom([])

// Derived count for the sidebar nav-row badge (#gallery-nav-count).
// Read-only; updates automatically when galleryEntriesAtom changes.
export const galleryCountAtom = atom((get) => get(galleryEntriesAtom).length)
