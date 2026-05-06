import { atom } from 'jotai'

// Single atom holding which modals are open. Nested modals (lightbox on top of
// gallery) can coexist — this is a dict, not a single string. Each modal
// component reads its own slot.
//
// `timeMachine`, `help`, `printExport` slots were retired alongside the
// sidebar editor (Phase 1.2) — they had no consumers in /app and only
// served as silent footguns the way `share` did before it was removed.
export const modalsAtom = atom({
  gallery: false,
  lightbox: false,
  posterPreview: false,
  aiRender: false,
})

// Lightbox payload — which gallery entry is being viewed. ModalManager reads
// this to pass into <Lightbox />. Set by whoever opens the lightbox.
export const lightboxEntryAtom = atom(null)
