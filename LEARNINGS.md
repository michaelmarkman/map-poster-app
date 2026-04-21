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

## 2026-04-17 — Scoping a universal reset with `body.class *` raises its specificity above your component rules

- Wrapped the editor's `* { margin: 0; padding: 0; box-sizing: border-box }`
  reset behind `body.editor-mounted *` to keep it from leaking to other
  React routes. The editor layout collapsed: every slider row, section
  head, toggle row had its `padding` zeroed.
- `*` has specificity (0,0,0,0). `body.editor-mounted *` has (0,0,1,1) —
  higher than any single-class rule like `.control-row { padding: 10px }`
  (0,0,1,0). The "reset" became an override.
- Use `:where(body.editor-mounted) *` — `:where()` always contributes
  zero specificity, so the reset keeps its "loses to everything" posture.
  Same trick for the `html:has(body.editor-mounted) { height: 100% }`
  rule. The smoke test missed this because the sidebar still rendered,
  just with broken spacing — visual-regression tests would have caught
  it. Fix in `src/pages/editor/styles/editor.css` first commit on branch
  `fix-css-reset-specificity`.

## 2026-04-17 — "Unused" deps may still be required as transitive peers

- Removed 9 deps after grep confirmed zero direct imports in src/. Pushed,
  Vercel build failed: `@takram/three-atmosphere/r3f` imports `ScreenQuad`
  from `@react-three/drei`. Our code never imports drei directly; drei
  (and its peers react-use + stats-gl) is pulled in by the atmosphere
  package's r3f entry. Vercel stopped deploying and kept serving the
  previous build — which was the CSS-reset-specificity-broken one — so
  my `:where()` fix from PR #18 never reached users. They saw the
  collapsed sidebar long after I thought I'd fixed it.
- `npm run build` locally didn't reproduce the failure because
  `node_modules` still had the deps cached from before the removal.
  `rm -rf node_modules && npm install && npm run build` would have
  surfaced it.
- Fix: added drei + react-use + stats-gl back. Before declaring a dep
  unused: (a) grep the kept packages' node_modules for imports of it,
  or (b) nuke node_modules and rerun install+build. Smoke can't catch
  it — smoke only runs if the build succeeds.
- Also worth knowing: Vercel does NOT show you "build failed, falling
  back to previous build" in any visible way on the live site. Check
  deployment status after every push that touches deps or build config.

## 2026-04-17 — Gallery→Lightbox was passing a wrapper shape, rendering blank

- Clicking a gallery entry opened the lightbox but the image was black.
- `GalleryModal` was setting `lightboxEntryAtom` to `{ item, idx, gallery }`.
  `Lightbox` reads the atom directly for `entry.dataUrl` — which was
  undefined because dataUrl lives on `item`, not the wrapper.
- Fixed: GalleryModal now sets the atom to the item itself AND dispatches
  `open-lightbox` with `{ entries: gallery, startIndex: idx }` so prev/
  next navigation also works. The shape that leaves GalleryModal matches
  what Lightbox's event listener expected. Another case for
  `event-contracts.test.js` — wrapper/bare-object shape drift across
  hooks was a whole class of bug this session.

## 2026-04-17 — Lightbox nav felt reversed because DB order ≠ grid order

- Gallery stored entries oldest-first (IndexedDB insertion order). The
  grid displayed them newest-first (buildGalleryEntries reversed).
  Lightbox used raw DB index, so left-arrow went to the OLDER item —
  visually to the right/below in the grid. Counter-intuitive.
- Fix: GalleryModal now reverses the entries list when dispatching
  `open-lightbox`, and translates startIndex to the reversed position.
  Prev/next now walk the grid left-to-right, top-to-bottom as expected.

## 2026-04-17 — z-index between modals needs a stacking plan

- Opening poster-preview from inside the lightbox-in-gallery made the
  preview appear behind both — looked like the button did nothing.
- Modals live at `.modal` (200), `#lightbox` (300), `#poster-preview`
  was at (150). Anything opened from 200+ needs to be higher. Bumped
  poster-preview to 400. Whole stacking plan is now: modal 200,
  lightbox 300, poster-preview 400, help/share 400+.

## 2026-04-17 — Animate the CSS custom property, not width/height, for a smooth aspect transition

- Aspect-ratio changes felt jumpy. Animating `width` + `height` directly
  made the DOM rect interpolate but the WebGL drawing buffer only updated
  on discrete resize events (we were dispatching 4 across the window) —
  in between frames, the canvas content was CSS-stretched until the next
  resize event snapped it back.
- Fix: register `--ratio` via `@property { syntax: '<number>' … }` so the
  browser treats it as an animatable number. Transition `--ratio` itself.
  The `width/height: min(...)` formulas recompute continuously as --ratio
  interpolates, and R3F's internal ResizeObserver fires on every frame
  of the animation — camera aspect tracks perfectly, no snap.
- Removed the 4 manual `dispatchEvent('resize')` timers; left a single
  safety-net resize at 470ms for browsers without @property support.
- Eased with `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-expo-ish) over
  450ms — more cinematic than the default ease.

## 2026-04-17 — CSS-only aspect-ratio transition is impossible to make fully smooth with WebGL

- Tried animating width/height + 4 resize dispatches, then tried animating
  @property --ratio so the calc() recomputes continuously. Both still
  felt jumpy because R3F calls `gl.setSize` every frame of the animation,
  which reallocates the drawing buffer and re-runs the scene's post-
  processing chain (clouds + DoF + atmosphere is ~20ms/frame on my
  machine). Even at 60fps-ideal, the scene hitches.
- Guaranteed-smooth approach: snapshot the canvas as a data URL at the
  moment the ratio changes, overlay that as a `<img object-fit: cover>`
  on top of the live canvas, let CSS animate the container to the new
  size (the img scales with it, zero WebGL work), fade the overlay out
  at the end so the live canvas reappears. User sees a static frame
  scaling, not a jittery re-render.
- `preserveDrawingBuffer: true` on the WebGL context is required for
  `canvas.toDataURL()` to work — already set in EditorCanvas.jsx for
  the export pipeline, so no extra cost.
- Trade-off: during the ~500ms transition the scene is "frozen." Camera
  moves / time-of-day changes won't show until the transition ends.
  Acceptable for a deliberate UI action like picking a new ratio.

## 2026-04-17 — `__forceCanvasReflow` (display:none + offsetHeight) kills the transition you just started

- Snapshot-overlay approach landed. Ratio change appeared to skip animation
  entirely — container snapped to the new size instead of transitioning.
- `__forceCanvasReflow()` was being called right after setting --ratio.
  It sets `display: none`, reads offsetHeight, then restores display.
  Browsers treat display:none → display restored as 'start from new
  computed value', which cancels the in-flight transition on width/height.
- Fix: don't call the reflow helper on ratio change. @property --ratio
  makes the min(calc(...)) formulas recompute without the hack. The
  helper still exists on window for any legacy caller; it just isn't
  the default anymore.
- General pattern: any reflow trick that briefly removes the element
  from composition will cancel CSS transitions on it. If you need both
  a recalc AND an animation, do the recalc BEFORE the style change
  you want to animate.

## 2026-04-17 — `npm run smoke` catches what unit tests can't

- Minifier bugs, concurrent-render drops, event-contract mismatches all
  slipped past 63 unit tests — they only surfaced on the prod bundle in
  a real browser.
- `scripts/smoke.js` builds the prod bundle, serves it, drives a headless
  Chromium through a full canary (save/restore, saved views, CSS vendor
  prefixes present, no page errors). Run with `npm run smoke` before
  claiming anything is done. CI runs it on every PR.

## 2026-04-20 — responsive.css targets /app-classic, not /app

- After the pill editor was promoted to /app (commit f6fd870), the 299-line
  responsive.css still targets `#sidebar`, `#main`, `#canvas-container`,
  `.section-head`, `.gallery-grid` — IDs/classes that only exist in the
  legacy sidebar editor (now at /app-classic). The new pill editor uses
  `.mock-*` classes, so **none** of the phone/tablet breakpoints applied
  on /app. No bottom sheet, no 44pt tap targets, no safe-area insets.
- Fix: add touch/responsive rules directly to mock.css. Three scoped
  layers — `(pointer: coarse)` for tap targets, `(hover: none)` for
  iOS hover-stick, `(max-width: 768px|640px)` for phone layout.
- HoverPopoverPill was pointerEnter/pointerLeave-only → popover never
  opened on touch. Added a `useCoarsePointer()` hook; on touch the
  pill's onClick toggles `open` AND fires onToggle; tap-outside +
  Esc close. Desktop hover path preserved.
- If the editor is rewired again, keep this in mind: the responsive
  layer is now split between responsive.css (/app-classic) and the
  bottom of mock.css (/app). Eventually worth unifying.

## 2026-04-20 — Mobile DoF "black band" had three compounding causes

- Bug: on iPhone, the custom DoF effect produced a hard dark stripe
  across the scene at the focal plane boundary. With clouds ON it
  was very prominent; with clouds OFF still visible as mid-ground
  banding. Desktop looked fine.
- Cause 1 — OOB samples return black on mobile. The 81-sample ring
  blur read `uv + offset` without clamping. Desktop GPUs clamp-to-edge
  implicitly; many mobile GPUs return black for texel fetches outside
  [0,1], darkening any pixel whose blur ring extended off-screen.
- Cause 2 — mediump depth quantization flipped pixels into the
  `rawDepth >= 1.0` short-circuit. That branch applied full `maxBlur`
  while the CoC path next door applied ~0. Adjacent pixels straddling
  the 1.0 boundary produced a step discontinuity that reads as a
  dark seam.
- Cause 3 — mediump precision on `perspectiveDepthToViewZ` with
  `cameraFar ~1e7` (globe) jitters viewZ, which jittered the
  `abs(viewZ-focalZ) / abs(focalZ)` CoC, which made the
  `if (coc >= 0.5)` hard threshold flip between blurred/unblurred
  between neighbors → banding at the focal boundary.
- Fix (CustomDofEffect.jsx):
  1. `clamp(uv + offset, 0, 1)` on every ring sample.
  2. `highp` qualifiers on `rawDepth / focalRaw / viewZ / focalZ /
     relDiff`, plus `max(abs(focalZ), 0.001)` for div-by-zero.
  3. Replaced hard `rawDepth >= 1.0` branch with a smoothstep(0.99,1)
     ramp that mixes CoC-blurred and full-blur.
  4. Replaced `if (coc >= 0.5)` with a smoothstep(0,1.5,coc) mix
     between inputColor and ringBlur.
  5. Mobile-only shader variant with 37 samples in 3 rings (vs 81 in
     4) via a `#define MOBILE_DOF` the JS side splices in at
     construction time. Saves ~55% fragment cost at the same visual
     quality for moderate radii.
- General rule: any fragment shader reading a neighborhood sample
  pattern needs UV clamping if it's going to ship to mobile. The
  "works on desktop / broken on iPhone" sampling bug is almost always
  this.

## 2026-04-20 — iOS Safari throttles rAF on an idle WebGL canvas; invalidate() on state change

- Bug: on iPhone, dragging the time-of-day pill moved the slider but
  the sky/sun didn't change until the user panned the camera. Same for
  tap-to-focus — the focal UV was written but DoF didn't shift until
  something else woke the loop.
- Mechanism: R3F's `frameloop='always'` is only "always" as long as the
  browser keeps running the requestAnimationFrame chain. iOS Safari
  (more so than Chrome/desktop) throttles rAF aggressively on a
  foreground tab whose canvas appears idle — especially with
  `preserveDrawingBuffer:true`, which disables some power optimizations.
  The React atoms updated, the sceneRef sync fired, but useFrame hadn't
  ticked yet so the shader uniforms still held the old values.
- Fix (editor/scene/Scene.jsx + EditorCanvas.jsx):
  1. Explicit `frameloop="always"` on the Canvas — matches the default
     but states the intent.
  2. `useInvalidateOnSceneChange()` in Scene: subscribes to
     timeOfDay/sunRotation/dof/clouds/bloom/ssao/vignette atoms and
     calls `invalidate()` on every change. Wakes the rAF loop
     immediately so the first post-change frame lands on screen.
  3. ClickToFocus now calls `invalidate()` right after writing
     `sceneRef.dof.focalUV` on tap/click — tap-to-focus doesn't go
     through atoms so the hook above can't see it.
- General rule: anywhere the app writes to sceneRef directly (bypassing
  atoms) or changes visible render state in response to a single user
  gesture, call invalidate(). Cheap on desktop, load-bearing on mobile.
