# Learnings

Append-only log of non-obvious things discovered while working in this repo.
Newest entries at the bottom. If something bit you and wasn't obvious from
reading the code, write it here before you move on — the next session (or
the next agent) will thank you.

**Format (keep it tight):**

```
## YYYY-MM-DD — one-line title

- What bit me (one or two sentences, concrete)
- Why it happens (mechanism, not mystery)
- How it's avoided now (file/line, commit SHA, or config knob)
```

Durable patterns that apply broadly belong in CLAUDE.md "Gotchas". This
file is the raw log — CLAUDE.md is the curated summary.

---

## 2026-04-17 — Rolldown's default CSS minifier strips vendor-prefixed properties

- `backdrop-filter` was present in source but missing from prod CSS. Chrome/
  Firefox read the unprefixed form; rolldown's minifier kept only
  `-webkit-backdrop-filter`. Sidebar glass disappeared only in prod.
- The minifier treats `-webkit-X` and `X` as duplicate declarations and
  keeps whichever came last; there's no option to disable.
- Fixed in `vite.deploy.config.js` with `build.cssMinify: 'esbuild'` —
  esbuild keeps both forms. Commit 6f15f40.

## 2026-04-17 — Per-frame atoms in a debounced effect's deps starve the timer

- `useSessionPersistence` wasn't saving anything. Atoms, camera, UI all
  correct in-memory; localStorage stayed at defaults.
- `cameraReadoutAtom` updates ~5Hz from Scene's useFrame (live camera
  readout). Having it in the save-effect's deps list cleared the 500ms
  `setTimeout(writeNow, 500)` every 200ms, so the timer never fired.
- Fixed in `src/pages/editor/hooks/useSessionPersistence.js` — dropped
  `cameraReadout` from the deps list, added dedicated `camera-set` /
  `fov-change` listeners + a 1Hz position poll + `beforeunload` flush.
- Guarded by a regex test in `__tests__/integration/event-contracts.test.js`
  so the atom can't sneak back into the deps list.

## 2026-04-17 — three.js `camera.fov` is vertical, not horizontal

- Focal length slider was sending the camera to space on every tick.
- Two `fov-change` listeners existed: Controls.jsx used vertical
  (`2 * atan(12/mm)` — 24mm sensor height) with dolly zoom, Scene.jsx used
  horizontal (`2 * atan(36/(2*mm))` — 36mm sensor width) without. They
  disagreed on oldFov vs newFov so the dolly math moved the camera by
  enormous amounts every slider tick.
- Removed the duplicate Scene listener. Controls is the sole authority.
  All restore code paths (useLayoutEffect + restore-view) use the
  vertical formula. Commit 7c0d964.

## 2026-04-17 — Opaque ancestor + backdrop-filter = nothing to blur

- Sidebar rendered flat grey, not glassy. Same CSS as prototype.
- The React port wrapped everything in `<div className="editor-root"
  style={{position:'fixed', inset:0, background:'#1c1b1f'}}>`. Sidebar's
  `backdrop-filter` had an opaque solid fill sitting between it and the
  canvas — nothing to blur through.
- Fixed by making `.editor-root` a transparent flex pass-through. The
  body itself paints `#1c1b1f` via `body.editor-mounted`. Commit 50063cb.
- Generalizes: any element above a backdrop-filter element that fully
  covers the filter's region with an opaque fill will break the effect.

## 2026-04-17 — React 19 concurrent rendering can drop during-render ref writes

- `latest.current = { ...atoms }` at the top of a custom hook was getting
  dropped under the prod build — the save effect read stale defaults.
- React 19's concurrent mode discards renders that get interrupted by
  higher-priority work. Mid-render side effects (like ref mutation)
  don't survive the discard.
- Always update refs inside a `useEffect`, never during render.
  Commit b94180d (`useSessionPersistence.js`).

## 2026-04-17 — Mobile bottom-sheet `transform: translateY(0)` kills backdrop-filter

- Sidebar-as-bottom-sheet (mobile breakpoint) had no blur.
- An identity transform still creates a new stacking context. On Safari,
  that context traps `backdrop-filter` — the filter has nothing to see
  through to because everything below is now outside its stacking context.
- Use `top/bottom` positioning for the sheet instead of `transform` where
  possible. Transform only for the fully-hidden state.
  `responsive.css`, commit 7a7c0f0.

## 2026-04-17 — Scene event contracts deserve integration tests

- Two recurring regressions: `save-view` dispatched a full
  `{id, camera: {position}, tod, …}` but Scene's `restore-view` listener
  expected `{position, quaternion, up}` at the top level. Same mistake a
  week later with a different event.
- Unit tests mocked each side, missed the contract mismatch.
- Added `src/pages/editor/__tests__/integration/event-contracts.test.js`.
  Any new window-event channel between hooks and Scene gets a test here
  that fires the real event and asserts both ends agree.

## 2026-04-17 — `npm run smoke` catches what unit tests can't

- Minifier bugs, concurrent-render drops, event-contract mismatches all
  slipped past 63 unit tests — they only surfaced on the prod bundle in
  a real browser.
- `scripts/smoke.js` builds the prod bundle, serves it, drives a headless
  Chromium through a full canary (save/restore, saved views, CSS vendor
  prefixes present, no page errors). Run with `npm run smoke` before
  claiming anything is done. CI runs it on every PR.
