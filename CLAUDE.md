# CLAUDE.md

## Working Style
- Research before editing. Never change code you haven't read.
- `npm run smoke` before claiming anything is done — unit tests miss the minifier / concurrent-render / event-contract classes of bug.
- **When you discover something non-obvious, append to `LEARNINGS.md` before moving on.** One dated entry, 3 bullets (what bit you, why, how it's avoided now). This is how sessions and subagents stay in sync — the SessionStart hook surfaces the most recent entries automatically. Durable patterns graduate from LEARNINGS.md into this file's Gotchas section during cleanup passes.

## Commands

```bash
npm run dev           # Vite dev server with SPA-fallback middleware for React Router
npm run build         # Production build → dist-deploy/ (uses vite.deploy.config.js)
npm test              # Vitest watch mode
npm run test:run      # Vitest single run (63 tests)
npm run smoke         # Build + serve dist-deploy + run Playwright canary (19 checks)
npm run smoke:headed  # Same, but with a visible browser window
npm run lint          # ESLint flat config — fails on errors, allows warnings
npm run lint:fix      # ESLint with --fix
npm run format        # Prettier write
npm run format:check  # Prettier verify only
```

A pre-push hook (`.husky/pre-push`) runs lint + `test:run` automatically. CI
(`.github/workflows/ci.yml`) adds the smoke check on every PR. Bypass
with `git push --no-verify` in an emergency.

## Architecture

Two editor routes share one Scene + one set of atoms/hooks/modals:

- **`/app` (default)** — pill-based UI. Floating glass pills around a full-bleed canvas; an aspect-ratio frame overlay shows the poster crop. Lives in `src/pages/mock/`. (The folder name is historical from when this was a prototype variant — don't read into it.)
- **`/app-classic`** — the legacy sidebar UI. Lives in `src/pages/editor/`. Preserved for reference + still receives shared changes.
- **`/mock`** → 301-style React Router redirect to `/app`.

Both editors mount the same scene (`src/pages/editor/scene/`) and share atoms, hooks, modals, and most utilities. Cross-imports go one direction: pill (`pages/mock/`) imports from sidebar (`pages/editor/`); never the reverse.

The editor was migrated from the standalone HTML prototype at `prototypes/poster-v3-ui.{html,jsx}` — that prototype still builds and routes (via `vercel.json`), kept as a reference implementation. Changes go into the React tree; the prototype is intentionally frozen.

```
src/
├── App.jsx                     # Routes; /app + /app-classic are full-screen (no AppLayout)
├── main.jsx                    # React root
├── index.html                  # SPA entry — script src is absolute /src/main.jsx
├── contexts/AuthContext.jsx    # Supabase auth (falls back gracefully if env missing)
├── components/ProtectedRoute   # Bypasses when no Supabase configured
├── pages/editor/               # /app-classic — sidebar editor + the SHARED scene/atoms/hooks
│   ├── EditorPage.jsx          # /app-classic route entry
│   ├── EditorShell.jsx         # Sidebar layout + mounts all hooks (order matters)
│   ├── atoms/                  # Jotai atoms — scene, ui, sidebar, modals, gallery
│   ├── scene/
│   │   ├── EditorCanvas.jsx    # <Canvas> wrapper
│   │   ├── Scene.jsx           # THE important file. useFrame reads sceneRef.
│   │   ├── Globe.jsx, Controls.jsx, PostProcessing.jsx, CustomDofEffect.jsx
│   │   ├── stateRef.js         # Mutable mirror of scene atoms (60fps reads)
│   │   └── events.js           # dispatchCameraSet / dispatchFlyTo / etc.
│   ├── sidebar/                # 6 sections, all atom-driven (only mounted at /app-classic)
│   ├── modals/                 # Always-mount pattern; each self-gates on modalsAtom
│   ├── overlays/               # CanvasHUD, TextOverlay, PosterPreviewToggle
│   ├── hooks/                  # useSession, useSavedViews, useGallery, useQueue, …
│   └── styles/                 # 8 co-located CSS files (don't put CSS elsewhere)
├── pages/mock/                 # /app — pill editor (the new default UI)
│   ├── MockEditorPage.jsx      # /app route entry
│   ├── MockEditorShell.jsx     # Pill layout + mounts the same hook set as /app-classic
│   ├── components/             # Pill primitives + 5 corner clusters
│   ├── modals/AIRenderModal.jsx
│   ├── hooks/useSavedGraphics.js
│   ├── styles/mock.css         # All `body.mock-mounted`-scoped overrides
│   ├── utils/frameRect.js
│   └── atoms.js                # editingBackdropAtom (render-edit backdrop)
scripts/smoke.js                # Prod-build canary; tests both /app and /app-classic
docs/superpowers/               # Migration spec + plan — read before big changes
prototypes/                     # Reference implementation; don't edit
```

**State pattern.** Jotai atoms are the UI source of truth. `Scene.jsx`'s `useFrame` reads from `sceneRef` (a mutable mirror of atom values), NOT the atoms directly — React render rate is too slow for 60fps reads. `useSceneRefSync` at the top of Scene keeps the mirror in lockstep with atoms.

**Event channels between UI and Scene** (all on `window`):
- `camera-set` — sidebar slider → Scene moves camera
- `fly-to` — location search → Scene tweens camera
- `fov-change` — focal length slider → Controls.jsx dolly-zooms
- `get-camera` — save-view / session save → Scene responds via `detail.resolve(cam)`
- `restore-view` — saved-view click OR session restore → Scene applies camera
- `effects-changed` — effects toggle → Scene re-renders composer
- `save-session` — forces immediate persist
- `aspect-changed`, `location-changed`, `gallery-add`, `open-*` for modals, queue, etc.

When adding a new event: **test both sides of the contract in `__tests__/integration/event-contracts.test.js`**. Half the regressions this session were shape mismatches.

## Gotchas (things that actually broke in the last session)

1. **Never put a per-frame atom in a debounced effect's deps.** `cameraReadoutAtom` updates at 5Hz from Scene's useFrame. Having it in `useSessionPersistence`'s save-deps starved the 500ms debounce — save never fired. Atoms that change faster than the debounce don't belong as deps.

2. **Camera position lives outside atoms.** `registerCamera(camera)` in Scene's `useLayoutEffect` exposes the Three.js camera to the session-persistence hook. Without that call, only tilt/heading/altitude get saved — on restore the camera snaps back to the Empire State default.

3. **fov is VERTICAL.** three.js `camera.fov` is vertical degrees. Formula: `2 * atan(12 / mm)` (24mm full-frame sensor height). NOT `2 * atan(36 / (2*mm))` (horizontal). Two listeners using different formulas compound every slider tick and send the camera to space.

4. **CSS minifier strips vendor prefixes.** Rolldown's default CSS minifier deduplicated `backdrop-filter` / `-webkit-backdrop-filter` and kept only the prefixed form — Chrome/Firefox don't read that, so the sidebar glass disappeared only in prod. Fix in `vite.deploy.config.js`: `cssMinify: 'esbuild'`.

5. **Don't wrap `#sidebar` + `#main` in an opaque container.** The sidebar's `backdrop-filter` blurs what's painted behind it; if an ancestor fills its region with a solid background, there's nothing meaningful to blur. `.editor-root` is a transparent flex pass-through; keep it that way.

6. **React 19 concurrent rendering can drop during-render ref writes.** `latest.current = {…}` in the function body was silently dropped under the prod build. Update refs in `useEffect`, not render.

7. **Build + prod paths differ.** Vite dev serves raw CSS/JS; prod minifies + tree-shakes. `npm run smoke` drives the actual prod bundle through a headless browser and catches all of the above.

## Testing

- `src/pages/editor/__tests__/*.test.js` — unit tests with Vitest + jsdom
- `src/pages/editor/__tests__/integration/*.test.js` — cross-boundary tests (event contracts, save/restore shapes)
- `scripts/smoke.js` — headless Chromium against the built artifact

## References

- `LEARNINGS.md` — running log of gotchas discovered while working here. Read the top of it when something feels weird.
- `docs/superpowers/specs/2026-04-17-editor-react-migration-design.md` — architecture spec
- `docs/superpowers/plans/2026-04-17-editor-react-migration-plan.md` — phase-by-phase plan
- `docs/superpowers/specs/2026-04-16-mobile-compatibility-plan.md` — mobile bottom-sheet, touch targets, perf tiers
- `docs/superpowers/adr/` — architecture decisions worth remembering
  (scene-ref mirror pattern, event channels, build-minifier choice)

## Deployment

Vercel auto-deploys on push to `main`. Rewrites in `vercel.json`:
- `/` → `/prototypes/index.html` (landing is the prototype page, not React)
- `/app`, `/app/*` → `/src/index.html` (pill editor)
- `/app-classic`, `/app-classic/*` → `/src/index.html` (sidebar editor)
- `/mock`, `/mock/*` → `/src/index.html` (React redirects to /app)
- `/*.html` → their matching prototype pages

React routes like `/login`, `/signup`, `/community`, `/profile`, `/gallery` are NOT rewritten in `vercel.json`. They work in dev via the SPA-fallback middleware in `vite.config.js` but deep-linking them in prod will 404. Add them to `vercel.json` if needed.
