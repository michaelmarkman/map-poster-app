# Editor React Migration — Design

Status: proposal, 2026-04-17
Scope: migrate `prototypes/poster-v3-ui.html` + `prototypes/poster-v3-ui.jsx` into the React SPA at `src/`, done incrementally with a safe visual/functional parity gate at every phase.

## 1. Why

Today the "editor" is a standalone HTML file in `prototypes/` with a 2230-line inline `<style>`, a 3700-line JSX that mutates a module-level `state` object, and ~60 imperative `document.getElementById().addEventListener()` wire-ups in a single `wireUI()` function. The React SPA in `src/` links out to it with `<a href="/prototypes/poster-v3-ui.html">` and the editor is architecturally disconnected from auth, routing, and the rest of the app. This blocks:

- Shared layout (navbar, auth context) on the editor page
- Reuse of atoms/state between editor and community/gallery
- Testable, independently understandable units
- Clean deployment (separate Rollup input per page)

The goal is to land the editor as a proper React feature under `src/pages/editor/` with component boundaries, React-owned state, and no regressions in the live app.

## 2. Anti-goals / YAGNI

- **No rewrite of the R3F/Three.js scene semantics.** The 3D render pipeline is the product — we move it, we don't reshape it. `state.*` numerical defaults, effect parameter ranges, camera math stay identical.
- **No forced Jotai migration.** Start with `useState` + Context. Jotai is a dep but adopting it is a separate decision; this spec doesn't require it.
- **No new features.** Mobile Phase 4 (gallery polish, safe-area-inset) is a separate plan and stays separate.
- **No TypeScript migration.** The codebase is JSX; keeping it JSX avoids a 10k-line type-annotation detour.
- **No Fabric.js graphic editor rewrite.** It stays imperative inside a React wrapper (`GraphicEditorOverlay`) that owns mount/unmount. Decoupling Fabric from direct DOM access is multi-day work and out of scope.
- **No test suite scaffolding.** The project has no tests today; adding Vitest + testing-library in this same refactor doubles the risk surface.

## 3. Target architecture

```
src/pages/editor/
├── EditorPage.jsx             # route entry, wraps in EditorProvider + ErrorBoundary
├── EditorShell.jsx            # layout: sidebar + canvas + overlays + modals
├── context/
│   └── EditorContext.jsx      # Provider + useEditor() hook
├── hooks/
│   ├── useEditorState.js      # camera, effects, ui flags (replaces module `state`)
│   ├── useSessionPersistence.js # localStorage save/restore
│   ├── useSavedViews.js       # localStorage saved views
│   ├── useGalleryData.js      # IndexedDB gallery entries
│   ├── useTimeMachine.js      # decade render queue
│   └── useModals.js           # modal open/close registry
├── scene/
│   ├── EditorCanvas.jsx       # R3F <Canvas> + composer wrapper
│   ├── Scene.jsx              # globe + atmosphere + clouds + sun + useFrame
│   ├── Globe.jsx              # TilesRenderer + plugins
│   ├── PostProcessing.jsx     # Bloom/SSAO/Vignette/DoF/SMAA/Dithering/LensFlare
│   ├── Controls.jsx           # WasdFly, FovListener, ClickToFocus
│   └── CustomDofEffect.js     # existing Effect class (moved, not rewritten)
├── sidebar/
│   ├── Sidebar.jsx
│   ├── EnvironmentSection.jsx # location search + time of day + clouds
│   ├── CameraSection.jsx      # tilt/heading/range/fov + saved views
│   ├── CanvasSection.jsx      # aspect + map style + render style presets
│   ├── TextSection.jsx        # title/subtitle/coords overlay fields
│   ├── EditorSection.jsx      # graphic editor entry (desktop only)
│   └── ExportSection.jsx      # size presets + export buttons
├── overlays/
│   ├── CanvasHUD.jsx          # ratio/lens/DoF readout
│   ├── CornerMeta.jsx         # coords + time footer
│   └── TextOverlay.jsx        # on-canvas text labels
├── modals/
│   ├── ModalManager.jsx       # central mount point
│   ├── GalleryModal.jsx
│   ├── TimeMachineModal.jsx
│   ├── Lightbox.jsx
│   ├── ShareModal.jsx
│   └── PosterPreviewModal.jsx
├── graphics/
│   └── GraphicEditorOverlay.jsx # wraps existing Fabric.js (editor-overlay.jsx)
├── queue/
│   └── ExportQueue.jsx
├── utils/
│   ├── camera.js              # sliderToAlt, altToSlider, intersectEarthSphere, clamp
│   ├── location.js            # geocoding, coordinate formatting
│   ├── sun.js                 # sun position, sky color
│   ├── export.js              # snapshotCanvas, composite, watermark
│   └── storage.js             # localStorage keys, IndexedDB helpers
└── styles/
    ├── editor.css             # extracted global editor styles
    ├── sidebar.css
    ├── modals.css
    └── tokens.css             # CSS custom properties (colors, fonts)
```

Entry point: `/app` route in `src/App.jsx` renders `<EditorPage />` directly (currently it renders a stub linking to `/prototypes/poster-v3-ui.html`).

## 4. State strategy

**Principle:** one source of truth per concern. The module-level `state` object, DOM `.value`/`.classList`, and `localStorage` currently all double as state. Collapse to React state in `EditorContext`, with explicit persistence adapters.

```js
// hooks/useEditorState.js — the shape
{
  // scene
  timeOfDay, setTimeOfDay,
  latitude, longitude, setLocation,
  sunRotation, setSunRotation,
  // effects (single setters, nested objects stay for shape parity)
  dof, setDof,          // { on, focalUV, tightness, blur, colorPop, globalPop }
  clouds, setClouds,    // { on, coverage, shadows, paused, speed }
  bloom, setBloom, ssao, setSsao, vignette, setVignette,
  // camera (read from R3F, written via dispatch)
  camera, dispatchCamera,  // { tilt, heading, altitude, fov }
  // ui
  sidebarCollapsed, setSidebarCollapsed,
  fillMode, setFillMode,
  aspectRatio, setAspectRatio,
  textOverlay, setTextOverlay,
  textFields, setTextFields, // { title, subtitle, coords }
}
```

**R3F bridge.** Scene components read values from context; per-frame mutations (sun angle, sky color) still happen inside `useFrame` using the latest ref (via `useRef` mirror of the state — React re-renders are not fast enough for frame-rate loops). The existing global `state` object is replaced by a ref updated from the context `useEffect`.

**Custom events.** `fly-to`, `camera-set`, `save-session`, `effects-changed` currently on `window`. Replace with `useEditor()` dispatch functions. Keep the window listeners during transition so legacy wire-ups still work until that code is moved.

**localStorage keys stay identical** (`mapposter3d_poster_v2_session`, `mapposter3d_v2_views`, etc.) so existing user sessions restore cleanly after deploy. The serialization format is preserved byte-for-byte; only the read/write call sites move.

## 5. CSS strategy

Current: one 2230-line `<style>` block with CSS variables at the top. No existing CSS modules in `src/`; the SPA uses inline style objects (see `src/pages/EditorPage.jsx`).

Decision: **plain co-located CSS files imported from components, not CSS modules.** Reasons:

- CSS modules would require renaming every class (`.sidebar-section` → scoped hash) and updating every JSX reference, plus the 60+ `document.getElementById` call sites.
- The styles are not reused outside the editor; scoping by file name is sufficient discipline.
- Vite handles plain CSS imports natively; no new tooling.

Split the monolith into:
- `styles/tokens.css` — CSS variables (colors, fonts) — imported by `EditorShell`
- `styles/editor.css` — global layout (body, canvas container, HUD)
- `styles/sidebar.css` — sidebar + sections + toggles
- `styles/modals.css` — all modal/overlay styles
- `styles/timemachine.css` — time machine specific (dense and self-contained)

Class names stay unchanged to avoid touching HTML/JSX identifiers in the same commit as the CSS move.

## 6. Migration sequence

Seven phases. Each phase ends with a **verification gate**: the editor loads at `/app` (or `/prototypes/poster-v3-ui.html` during transition), renders a globe, lets the user pan/tilt, opens the sidebar, toggles time-of-day. If any of those breaks, the phase is not done.

Each phase is its own commit. The branch stays deployable throughout — no phase leaves the editor in a broken state. Ralph loop rolls back if a verification gate fails.

### Phase 0 — Scaffolding (~25 min)
- Create `src/pages/editor/` directory tree (empty files with named exports)
- Add `<Route path="/app" element={<EditorPage />} />` already exists; no route changes
- `EditorPage.jsx` renders `<EditorShell />` which currently renders the existing stub
- Commit: "Scaffold editor/ directory"

### Phase 1 — CSS extraction (~60 min)
- Copy `<style>` content from `poster-v3-ui.html` into `src/pages/editor/styles/editor.css` (+ split files above)
- `EditorShell.jsx` imports the CSS files
- Verify: a blank `/app` page has the editor's background, fonts, color tokens loaded (visual diff via DevTools)
- Commit: "Extract editor CSS into co-located files"

### Phase 2 — Canvas mount inside SPA (~90 min)
- Copy `Canvas` + `Scene` + `Globe` + `PostProcessing` + effect setup from `poster-v3-ui.jsx` into `src/pages/editor/scene/`
- Move `state` object into `useEditorState` hook, wire into R3F via a ref (frame-stable)
- `EditorShell` renders `<EditorCanvas />` inside a full-viewport container
- Verify: `/app` shows the 3D globe, day/night doesn't crash, no console errors
- Commit: "Mount R3F editor canvas in SPA"

### Phase 3 — Sidebar components (~120 min)
- Copy sidebar HTML from `poster-v3-ui.html` into `Sidebar.jsx` as JSX (preserve class names + IDs)
- Split each `<section data-sec="…">` into its own `*Section.jsx` component
- Replace each `document.getElementById('tod-slider').addEventListener('input', …)` pair with `<input value={timeOfDay} onChange={…}>` in the matching section
- Drop the section from `wireUI()` once its controls are Reactified; leave unported sections temporarily imperative
- Saved views list renders from `useSavedViews` hook
- Verify: every sidebar control still works (time of day, tilt, heading, range, fov, DoF, clouds, map style, presets, aspect, text fields)
- Commit: "Port sidebar to React components"

### Phase 4 — Modals & overlays (~75 min)
- Gallery, Time Machine, Lightbox, Share, Poster Preview: each becomes a component that conditionally renders based on `useModals()`
- Central Esc key handler in `ModalManager`
- Replace `document.getElementById('…-overlay').style.display = 'block'` with `modals.open('gallery')`
- Verify: every modal opens/closes, gallery items still load, time machine renders decades, lightbox prev/next works
- Commit: "Port modals to React components"

### Phase 5 — Data hooks (~75 min)
- `useGalleryData` — IndexedDB reads, exposes `entries`, `addEntry`, `deleteEntry`
- `useTimeMachine` — decade render queue, exposes `sets`, `render`, `status`
- `useSessionPersistence` — on mount restore camera + state from localStorage; on state change debounced save
- Verify: reload the page, camera and all toggles restore exactly as before; gallery entries persist across reload
- Commit: "Move persistence to React hooks"

### Phase 6 — Final wire-up (~60 min)
- Delete `wireUI()` and any remaining imperative DOM readers
- `EditorPage.jsx` no longer links out; `/prototypes/poster-v3-ui.html` can stay as a dev-only prototype (file is not removed)
- `vite.deploy.config.js` keeps prototypes as secondary entries; main entry is the SPA
- Update `EditorPage.jsx` stub (the one that says "Open editor →") to actually render the editor
- Verify: `/app` is a full working editor; exporting, saving a view, search, time machine all succeed
- Commit: "Wire editor into /app route, remove imperative DOM wiring"

### Phase 7 — Cleanup (~25 min)
- Remove dead imports from `poster-v3-ui.jsx` (but keep the file — it's a working reference until we're confident)
- Spot-fix any regressions surfaced during phase 6 verification
- Commit: "Editor migration cleanup"

**Total: ~7h10m budgeted, ~6h30m actual work + verification gates**

## 7. Verification at each phase

Ralph loop pattern: after each phase's commit, run:
1. `npm run build` — must exit 0
2. Start Vite dev server, navigate to `/app`, check DevTools console for errors
3. Interact with a checklist of controls (different per phase, listed in plan)
4. If any step fails: revert the commit, log the failure, retry the phase
5. If three retries fail: stop the loop, surface the failure to me in the morning

This is the "carefully" part. No phase merges without passing its gate.

## 8. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| R3F re-renders tank FPS when state moves to React | Keep a ref mirror of state for per-frame reads. Context setter triggers re-render only at UI frequency; scene reads the ref. |
| Session restore breaks for existing users | localStorage keys + JSON shape preserved byte-for-byte. A restore test runs in phase 5 gate. |
| CSS class collisions with SPA navbar/landing styles | Editor CSS is only imported inside `src/pages/editor/*`; body-level selectors (`body.fill-mode`) are scoped to the editor route via a wrapper class `.editor-root`. |
| Fabric.js graphic editor loses its canvas | `GraphicEditorOverlay` mounts the existing `initEditor()` in `useEffect`, disposes in cleanup. No Fabric changes. |
| Sidebar event listeners fire twice during transition | Phase 3 removes each section from `wireUI()` as it's ported; `wireUI()` becomes empty by the end of phase 3. |
| Visual regression nobody notices | Each phase gate includes a quick visual check; full visual parity is a deliberate goal, not a hope. |
| 7h runs out mid-phase | Phases are ordered so the branch is always deployable — even if we stop after phase 3, the sidebar is Reactified and the rest can continue next session. |

## 9. Out of scope (future work)

- Jotai atoms (once state is in hooks, migration is mechanical)
- TypeScript migration
- Fabric.js graphic editor rewrite
- Test suite (Vitest + testing-library)
- Community/Profile pages similar refactor
- Prototype file deletion (keep as reference until editor is battle-tested)
