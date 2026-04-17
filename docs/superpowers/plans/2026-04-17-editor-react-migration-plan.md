# Editor React Migration — Implementation Plan

Spec: `docs/superpowers/specs/2026-04-17-editor-react-migration-design.md`
Started: 2026-04-17

## Cadence

After every phase: commit, verify gate, advance todo list. If a gate fails: don't proceed, fix in place. Target ~7h total.

## Phase 0 — Scaffold

**Goal:** empty skeleton in place so parallel agents in later phases don't race on directory creation.

- [x] Create `src/pages/editor/` with subdirs: `context`, `hooks`, `scene`, `sidebar`, `overlays`, `modals`, `graphics`, `queue`, `utils`, `styles`
- [x] Create placeholder `EditorPage.jsx` (re-exports current stub so `/app` still works)
- [x] Create placeholder `EditorShell.jsx`
- [x] Install Jotai (already a dep — confirm it resolves)
- [x] Install Vitest + testing-library/react (new dev deps)
- [x] Create `vitest.config.js`
- [x] Add `"test": "vitest"` script to `package.json`
- [x] Commit: "Editor migration: scaffold"

**Gate:** `npm run build` succeeds. `npm test` runs (no tests yet, passes trivially).

## Phase 1 — CSS extraction

**Goal:** the 2230-line inline `<style>` from `poster-v3-ui.html` split into co-located CSS files imported by editor components. Editor HTML file still works (keeps its `<style>` block in place as reference).

Split plan:
- `styles/tokens.css` — `:root` CSS variables (lines 18–63 of html)
- `styles/editor.css` — global layout (body, html, #main, #canvas-container, canvas HUD)
- `styles/sidebar.css` — `#sidebar`, `#sidebar-toggle`, sections, sliders, toggles, dropdowns
- `styles/modals.css` — all `.modal`, `.modal-panel`, `.lightbox`, `.pp-*` (poster preview), `.share-modal`
- `styles/timemachine.css` — time-machine specific styles
- `styles/graphics.css` — graphic editor toolbar + overlay

All class names and IDs **unchanged**. All CSS **copied verbatim** from the HTML — no rewriting, reflowing, or consolidating in this phase. Next phases will Reactify the consumers.

**Gate:** import all CSS into a test `<div className="editor-root">` in a throwaway route, check via DevTools that a hand-rolled `.sidebar-section` div renders with the same computed styles as the prototype page.

## Phase 2 — Canvas mount

**Goal:** R3F canvas + Scene + Globe + PostProcessing ported to `src/pages/editor/scene/`, state moved to Jotai atoms with a ref mirror for per-frame reads.

Files to create:
- `atoms/scene.js` — atoms for `timeOfDay`, `latitude`, `longitude`, `sunRotation`, `dof`, `clouds`, `bloom`, `ssao`, `vignette`
- `atoms/ui.js` — atoms for `sidebarCollapsed`, `fillMode`, `aspectRatio`, `textOverlay`, `textFields`
- `scene/stateRef.js` — keeps a mutable mirror of atom values, updated via a subscriber, read by `useFrame`
- `scene/EditorCanvas.jsx` — `<Canvas>` wrapper + `EffectComposer` (ported from `poster-v3-ui.jsx:108-126`)
- `scene/Globe.jsx` — `TilesRenderer` + `TilesPlugin`s + `CreasedNormalsPlugin` + `TextureAnisotropyPlugin` + `FidelityPlugin` (ported from 129-286)
- `scene/Scene.jsx` — Atmosphere, Clouds, Dithering, LensFlare, useFrame sun/sky (ported from 433-673)
- `scene/PostProcessing.jsx` — Bloom, SSAO, Vignette, SMAA, ToneMapping, CustomDofEffect (ported)
- `scene/CustomDofEffect.js` — Effect subclass (ported from 286-310)
- `scene/Controls.jsx` — WasdFly + FovListener + ClickToFocus (ported from 1164-1287)
- `utils/camera.js` — sliderToAlt, altToSlider, intersectEarthSphere, clampCameraAltitude, syncCameraToUI (ported from 675-793)
- `utils/sun.js` — sun position + sky color math
- `utils/three.js` — scratch vectors, DRACO loader init

**Verification:** blank `/app` route mounts a spinning globe. No console errors. Time of day can be changed via Jotai DevTools and sky visibly shifts.

**Gate:** build passes, `/app` renders a 3D globe, can tilt/pan.

## Phase 3 — Sidebar (parallel)

**Goal:** sidebar HTML moved into React components, each section owns its own controls via Jotai atoms, `wireUI()` shrinks section-by-section.

Agents spawned in parallel (each touches disjoint files):
- Agent 3A: `EnvironmentSection.jsx` — location search, time of day, clouds (html 2296-2379)
- Agent 3B: `CameraSection.jsx` — tilt/heading/range/fov + DoF + saved views (html 2381-2450)
- Agent 3C: `CanvasSection.jsx` — aspect ratio, map style, render presets, SSAO/Bloom toggles (html 2452-2520)
- Agent 3D: `TextSection.jsx` — title/subtitle/coords fields + text overlay toggle (html 2522-2560)
- Agent 3E: `EditorSection.jsx` — graphic editor entry + controls (html 2562-2585, desktop only)
- Agent 3F: `ExportSection.jsx` — size presets + export/save-view buttons (html 2587-2607)

Each agent:
1. Reads its HTML section from `poster-v3-ui.html` and its JS wiring from `wireUI()` in `poster-v3-ui.jsx`
2. Writes its component under `src/pages/editor/sidebar/`
3. Uses `useAtom` / `useSetAtom` from Jotai for state
4. Preserves all class names + IDs for CSS compatibility
5. Does NOT touch `wireUI()` — that gets removed wholesale in Phase 6

After all agents complete: `Sidebar.jsx` composes them, `EditorShell.jsx` mounts `<Sidebar />` alongside `<EditorCanvas />`.

**Gate:** every sidebar control visibly triggers a scene update (slider moves → scene changes). Matrix test: each of ~25 controls confirmed in under 90 seconds.

## Phase 4 — Modals (parallel)

**Goal:** each modal is a React component conditionally rendered from a Jotai atom.

Agents spawned in parallel:
- Agent 4A: `GalleryModal.jsx` — grid/large/list views, download-all, entry rendering (html 2648-2669 + JSX 2596-2626)
- Agent 4B: `TimeMachineModal.jsx` — decade slider, image carousel, research blurbs (html 2672-2689 + JSX 2440-2524)
- Agent 4C: `Lightbox.jsx` — image carousel, prev/next, download/share/save-view/poster-preview actions (html 2692-2709)
- Agent 4D: `ShareModal.jsx` — community post form (html 2712-2734)
- Agent 4E: `PosterPreviewModal.jsx` — 3D poster frame with drag-to-orbit (html 2737-2749)
- Agent 4F: `ModalManager.jsx` + `atoms/modals.js` — registry, Esc key handling, mount point

**Gate:** each modal opens, closes, does its primary action (gallery loads entries, time machine renders a decade, lightbox navigates, share posts, preview orbits).

## Phase 5 — Data hooks

**Goal:** IndexedDB + localStorage persistence moved into React hooks. Serial, because session/state/saved-views all touch the same `state` shape.

- `hooks/useSessionPersistence.js` — on mount: restore camera + atoms from `mapposter3d_poster_v2_session`; on atom change: debounced save (500ms)
- `hooks/useSavedViews.js` — read/write `mapposter3d_v2_views`, expose `views`, `saveView`, `deleteView`, `loadView`
- `hooks/useGalleryData.js` — IndexedDB `galleryEntries` store: `entries`, `addEntry`, `deleteEntry`
- `hooks/useTimeMachine.js` — IndexedDB `timeMachineSets` + render queue
- `utils/storage.js` — IndexedDB open/get/put/delete helpers

Wire these into the ModalManager and Sidebar where appropriate. Replace the legacy localStorage/IndexedDB direct calls in `poster-v3-ui.jsx`.

**Gate:** reload the page, everything restores — camera position, time of day, aspect, saved views, gallery entries all preserved. Create a new saved view, reload, confirm it's still there.

## Phase 6 — Wire `/app` route, remove imperative DOM wiring

- `EditorPage.jsx` renders `<EditorProvider><EditorShell /></EditorProvider>` (not a stub link)
- Delete `wireUI()` (should be empty after phase 3)
- Delete `saveSession`, `restoreSession`, gallery queue DOM builders, modal display togglers
- Keep `poster-v3-ui.jsx` file but strip it down to a re-export of `src/pages/editor/EditorPage`
- `poster-v3-ui.html` keeps its own entry for dev scratch
- `vite.deploy.config.js`: main SPA entry handles `/app`; prototype entry stays as is

**Gate:** `/app` route is the editor. `npm run build` passes. Full smoke test: search → fly to → tilt → change time of day → toggle clouds → save view → export → open gallery → close gallery → reload page → all state restored.

## Phase 7 — Tests + cleanup

- `utils/camera.test.js` — sliderToAlt/altToSlider roundtrip, intersectEarthSphere edge cases, clampCameraAltitude
- `utils/sun.test.js` — sun position at known times (noon UTC at lat 0, lon 0)
- `hooks/useSessionPersistence.test.js` — save/restore roundtrip with mocked localStorage
- `atoms/scene.test.js` — atom defaults, setter behavior
- Remove unused imports from `poster-v3-ui.jsx`
- Spot-fix any regressions

**Gate:** `npm test` passes, `npm run build` passes, final smoke test of `/app`.

## Mobile Phase 4 — Gallery polish (if time allows)

From `docs/superpowers/specs/2026-04-16-mobile-compatibility-plan.md` §7:
- Gallery `grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))` on phones
- Swipe carousel in lightbox (touchstart/touchmove)
- `env(safe-area-inset-bottom)` on `#editor-toolbar`, sidebar sheet, status bar
- Landscape tweaks for <500px tall

## Parallel execution strategy

The Agent tool supports `isolation: "worktree"` — each agent gets an isolated copy of the repo, returns its changes, and I merge them into this worktree. For Phase 3 (6 agents) and Phase 4 (6 agents), this means 12 worktrees total but no conflicts because each agent owns disjoint files.

For agents that only create new files under a dedicated subdir (sidebar/*, modals/*), I can forego worktree isolation since paths don't collide — they write to different files in the same worktree. Simpler and faster.

**Decision:** no worktree isolation for phase 3/4 agents because they write to disjoint new files. Worktree isolation only if I ever need an agent to modify a shared file.

## Ralph loop contract

At each phase:
1. Run the gate checks
2. If green → commit and advance
3. If red → fix in place, retry gate
4. If red 3× → stop, log to me

Don't progress past a red gate. Don't skip gates.
