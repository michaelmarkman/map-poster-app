import { atom } from 'jotai'

// (openSectionsAtom — which sidebar section was expanded — went with
// the sidebar editor in Phase 1.2. /app's pill UI doesn't have
// collapsible sections; nothing imports this atom anymore.)

// AI enhance panel state
// AI render is implicitly on whenever the Render Styles panel is used
// — the panel's whole reason to exist is AI renders. The atom stays so
// useQueue + session persistence don't need a rewrite, but it defaults
// to true and the UI no longer exposes a toggle.
export const aiEnhanceAtom = atom(true)
// Default seed for the custom-prompt field. Same composition-anchoring
// pattern as AI_PRESETS.realistic (useQueue.js) — the helicopter/DSLR
// language and bare "enhance realism" verbs drift composition badly,
// so the seed leads with what changes and what stays fixed.
export const aiPromptAtom = atom(
  'Re-render this aerial scene as a photoreal daylight cityscape — natural sunlight, realistic building materials, soft shadows. Only change lighting, materials, and texture realism. Do NOT change the camera angle or framing. Do NOT add, remove, or relocate any building. Do NOT add cars, people, signage, or text. Keep the exact same buildings, streets, and composition.'
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

// (savedViewMarkersOnAtom + hoveredSavedViewIdAtom retired with the
// in-scene marker layer in the Phase 2.7 cluster redesign — see plan
// "Vedute — UI Consolidation Pass". The defaultSavedViewIdAtom below
// stays; it drives the cold-load auto-restore.)

// Saved view id to load on first visit (or after a fresh page load when
// no session blob exists yet). Persisted via useSessionPersistence so the
// user's pick survives reloads. null = no default chosen.
export const defaultSavedViewIdAtom = atom(null)

// Onboarding flag — false on first visit, set true once the user has
// dismissed the welcome card. Persisted; survives reloads.
export const onboardedAtom = atom(false)

// First-boot intro sequence done flag. The intro plays on every page
// load (per Phase 2.7 follow-up: word "vedute" appears, definition
// types in, consolidates, controls reveal one-by-one, then the
// overlay fades to expose the editor). Set to true when the intro
// finishes (or the user hits Esc to skip). Other UI that should NOT
// appear during the intro (e.g. OnboardingCard) gates on this.
//
// Defaults to TRUE: IntroSequence is no longer mounted in
// MockEditorShell (retired pre-launch), so downstream consumers
// should treat the intro as already finished on every boot. The
// atom stays in the codebase so OnboardingCard's gate still
// compiles and the IntroSequence unit tests (which mount the
// component directly) can still drive it explicitly.
export const introDoneAtom = atom(true)

// Export resolution multiplier (1, 2, 3, 4)
export const exportResolutionAtom = atom(2)

// Saved views — array of { id, name, session }. Backed by localStorage key
// `vedute_views`; useSavedViews hook owns read/write.
export const savedViewsAtom = atom([])

// Queue entries — {id, status, resolution, startedAt, preset, result?}.
// Driven by useQueue hook; sidebar just displays count + empty state.
export const queueAtom = atom([])
