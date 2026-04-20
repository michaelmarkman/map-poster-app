import { atom } from 'jotai'

// Single atom holding which modals are open. Nested modals (lightbox on top of
// gallery) can coexist — this is a dict, not a single string. ModalManager
// reads it, each modal component reads its own slot.
export const modalsAtom = atom({
  gallery: false,
  timeMachine: false,
  lightbox: false,
  share: false,
  posterPreview: false,
  printExport: false,
  help: false,
  aiRender: false,
})

// Lightbox payload — which gallery entry is being viewed. ModalManager reads
// this to pass into <Lightbox />. Set by whoever opens the lightbox.
export const lightboxEntryAtom = atom(null)

// Share modal payload — prefill fields from the current view when the user
// clicks "Share" on a gallery entry.
export const shareDraftAtom = atom({
  title: '',
  description: '',
  location: '',
  entryId: null,
})
