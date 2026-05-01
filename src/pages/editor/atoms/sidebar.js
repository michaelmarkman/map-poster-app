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

// Whether to append the photogrammetry-cleanup directive to AI render
// prompts. The Google 3D Tiles source has jagged polygon corners and
// faceted rooftops at close zoom; the cleanup prompt tells the model
// to interpret those as their real-world clean architectural form.
// Defaults true (most renders look better with it). Render-sheet UI
// surface the toggle so users can flip it off when they actually
// want the mesh-faithful look (e.g. low-poly art renders).
export const aiCleanArtifactsAtom = atom(true)

// Toggles the in-scene layer of camera markers for saved views — see
// docs/superpowers/specs/2026-04-30-saved-view-camera-markers-design.md.
// Off by default; persists across sessions via useSessionPersistence.
export const savedViewMarkersOnAtom = atom(false)

// Export resolution multiplier (1, 2, 3, 4)
export const exportResolutionAtom = atom(2)

// Saved views — array of { id, name, session }. Backed by localStorage key
// `mapposter3d_v2_views`; useSavedViews hook owns read/write.
export const savedViewsAtom = atom([])

// Queue entries — {id, status, resolution, startedAt, preset, result?}.
// Driven by useQueue hook; sidebar just displays count + empty state.
export const queueAtom = atom([])
