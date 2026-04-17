import { atom } from 'jotai'

// Which sidebar section is expanded. The section-head buttons toggle this;
// other sections don't collapse automatically — open sections list is held
// here so saved-views / dropdowns can drive it too.
export const openSectionsAtom = atom({
  environment: true,
  camera: true,
  canvas: true,
  text: true,
  editor: true,
  export: true,
})

// AI enhance panel state
// AI render is implicitly on whenever the Render Styles panel is used
// — the panel's whole reason to exist is AI renders. The atom stays so
// useQueue + session persistence don't need a rewrite, but it defaults
// to true and the UI no longer exposes a toggle.
export const aiEnhanceAtom = atom(true)
export const aiPromptAtom = atom(
  'Make this look like a real aerial photograph. Keep the exact same buildings and layout. Enhance realism subtly.'
)
export const aiPresetAtom = atom(null) // null | 'realistic' | 'golden' | ...
export const aiApiKeyAtom = atom('') // Gemini — stored locally only

// Export resolution multiplier (1, 2, 3, 4)
export const exportResolutionAtom = atom(2)

// Saved views — array of { id, name, session }. Backed by localStorage key
// `mapposter3d_v2_views`; useSavedViews hook owns read/write.
export const savedViewsAtom = atom([])

// Queue entries — {id, status, resolution, startedAt, preset, result?}.
// Driven by useQueue hook; sidebar just displays count + empty state.
export const queueAtom = atom([])
