# ADR 0001: Mirror Jotai atoms into a `sceneRef` for per-frame R3F reads

**Status:** accepted, 2026-04-17
**Context:** React migration of the poster editor (see `docs/superpowers/specs/2026-04-17-editor-react-migration-design.md`).

## Context

The editor's scene (`src/pages/editor/scene/Scene.jsx`) runs `useFrame`
at up to 60 Hz. Inside the loop we read scene parameters — time of day,
cloud coverage, depth-of-field tightness, sun rotation — and write them
into shader uniforms and camera math.

State in the rest of the app is held in Jotai atoms. Reading an atom via
`useAtomValue` inside a component triggers a re-render when the atom
changes; a React re-render 60× per second is too expensive (GC pressure,
dropped frames, React StrictMode runs effects twice in dev, etc.).

## Decision

Scene state lives in two places by design:

1. **Jotai atoms** (`src/pages/editor/atoms/scene.js`, `atoms/ui.js`) —
   the source of truth. UI components read/write these directly.
2. **`sceneRef`** (`src/pages/editor/scene/stateRef.js`) — a mutable
   object mirroring the atom values. `useFrame` reads from `sceneRef`;
   it never subscribes to atoms.

A single `useSceneRefSync` hook (mounted once at the top of Scene)
subscribes to every scene atom and copies the current value into
`sceneRef` on change. UI-frequency work triggers re-renders normally;
frame-frequency reads never pay React reconciliation cost.

## Consequences

### Positive

- Per-frame reads are plain property access — no React overhead.
- UI can still observe state normally (sliders re-render on change).
- Easy to inspect: `window._sceneRef = sceneRef` during debugging.

### Negative / trade-offs

- Scene state is mutated in two places — confusing on first read. The
  ADR and the `stateRef.js` file docblock both call this out explicitly.
- Write-backs from `useFrame` to atoms (e.g., live camera position)
  need throttling — writing to an atom every frame defeats the purpose.
  Solved via the 5 Hz `syncCameraToUI` in `utils/camera.js`.
- If a new scene atom is added and `useSceneRefSync` isn't updated, the
  scene reads a stale default and the bug is invisible in the UI.
  Mitigation: `useSceneRefSync` lists every atom by name; adding an
  atom without syncing will be caught by reviewers (the file is
  intentionally small and grep-able).

## Alternatives considered

- **Everything in atoms.** Rejected — React re-render on each atom
  change would trigger a component re-render per frame. Jotai selector
  atoms don't help since we read *all* of them in the frame callback.
- **Everything in refs, no atoms.** Rejected — UI loses reactivity;
  sliders would need manual DOM updates and imperative wiring, which
  is exactly what the React migration set out to replace.
- **Zustand / a dedicated scene store.** Viable, but would require
  re-plumbing the UI. Jotai atoms were already the app's pattern;
  adding a second store is friction without clear benefit at current
  size.
- **useSyncExternalStore with a custom store.** Equivalent to the ref
  mirror for scene reads but forces every subscriber through the
  React tree. Ref mirror is simpler and has no subscription surface
  inside `useFrame`.

## Related decisions (will be their own ADRs if we formalize them)

- **Custom window events as the hook ↔ Scene protocol.** `camera-set`,
  `fly-to`, `fov-change`, `get-camera`, `restore-view`, etc. Documented
  informally in `CLAUDE.md`. Contracts tested in
  `src/pages/editor/__tests__/integration/event-contracts.test.js`.
- **`cssMinify: 'esbuild'` in `vite.deploy.config.js`** to keep both
  `backdrop-filter` and `-webkit-backdrop-filter` in the built CSS.
  Rolldown's default minifier dedupes vendor-prefixed properties.
- **Session-save debounce deps exclude per-frame atoms.** Any atom that
  updates more often than the 500 ms debounce would starve the timer.
  Guarded by a test in `event-contracts.test.js`.

## References

- Implementation: `src/pages/editor/scene/stateRef.js`, `Scene.jsx`
- Spec: `docs/superpowers/specs/2026-04-17-editor-react-migration-design.md` §4 "State strategy"
- Regression that justified making this explicit:
  `cameraReadoutAtom` in the save-effect deps resetting the debounce at
  5 Hz — commit b94180d.
