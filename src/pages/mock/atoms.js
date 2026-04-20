import { atom } from 'jotai'

// /mock-only: when set to a dataUrl, the <RenderBackdrop> component shows
// the image as the canvas backdrop (over the live WebGL scene) so users can
// edit graphics on top of a previously-rendered photo. Cleared on exit.
export const editingBackdropAtom = atom(null)
