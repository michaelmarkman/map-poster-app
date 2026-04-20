# Mock editor — floating-pills design

**Status:** Draft for review
**Date:** 2026-04-17
**Owner:** michael
**Goal:** Spin up `/mock`, a side-by-side variant of `/app`, to evaluate a
floating-pill chrome (no sidebar) without disturbing the production editor.

## Why

The current editor at `/app` lives behind a 6-section sidebar. We want to
explore a much more minimal chrome — ~11 pills floating around the canvas,
each one mapped to a specific control or modal — to see if the editor feels
better with the canvas truly front-and-center. Building it as a parallel
route lets us A/B both designs against the same scene + atoms without
forking the engine.

## Non-goals

- Replacing `/app`. `/mock` is exploratory.
- Changing the Scene, atoms, hooks, or modals. The mock route reuses every
  one of them; only the chrome is new.
- Backend changes. AI Render uses the same Gemini path the existing
  Render Styles panel does.

## Architecture

### Route

Add `<Route path="/mock" element={<ProtectedRoute><MockEditorPage /></ProtectedRoute>} />`
to `src/App.jsx`. `/mock` is full-screen like `/app` (no `AppLayout` wrapper).

### Files

```
src/pages/mock/
├── MockEditorPage.jsx          # Route entry → <MockEditorShell />
├── MockEditorShell.jsx         # Layout + mounted hooks
├── components/
│   ├── Pill.jsx                # base pill (icon + label + onClick)
│   ├── DragPill.jsx            # drag-to-scrub variant
│   ├── TogglePill.jsx          # on/off toggle (used for plain toggles)
│   ├── HoverPopoverPill.jsx    # toggle + hover-popover (Clouds, DoF)
│   ├── PopoverPill.jsx         # click-to-open-popover (Saved, Aspect, Search)
│   ├── ClusterTopLeft.jsx      # Search + Saved
│   ├── ClusterTopRight.jsx     # Time + Clouds + Focal + DoF
│   ├── ClusterBottomLeft.jsx   # Graphics Editor + Aspect
│   └── ClusterBottomRight.jsx  # Gallery + AI Render + Take a picture
├── modals/
│   └── AIRenderModal.jsx       # new modal — preset grid + queue
└── styles/
    ├── mock.css                # body scoping + grid background + canvas frame
    └── pills.css               # pill base + popover styles
```

### Reuse

`MockEditorShell` reuses (imports from `pages/editor/`):

- `scene/EditorCanvas` (the R3F Canvas wrapper)
- All atoms in `atoms/` (scene, ui, sidebar, modals, gallery)
- Hooks: `useSessionPersistence`, `useGalleryData`, `useSavedViews`,
  `useGraphicEditor`, `useQueue`. Skips: `useTimeMachine`,
  `useKeyboardShortcuts`. (Time machine isn't surfaced in /mock; the global
  shortcut layer is part of the clean-slate trade.)
- Modals: `GalleryModal`, `Lightbox` (used by GalleryModal),
  `PosterPreviewModal`, and `GraphicEditorOverlay`. Skips: `HelpModal`,
  `ShareModal`, `TimeMachineModal`.
- Events: `dispatchFlyTo`, `fov-change`, `restore-view`, `save-view`,
  `quick-download`, `add-to-queue`, `generate-all`, `clear-queue`,
  `queue-clear-done`, `toggle-graphic-editor`. All existing channels.

### Body scoping

`MockEditorShell` adds `mock-mounted` to `<body>` on mount (mirrors
`editor-mounted`). All `mock.css` selectors are scoped to
`body.mock-mounted` so the global CSS bundle doesn't leak into other
React routes.

## Layout

The shell is a transparent flex pass-through (same trick as `editor-root`)
so the canvas can render behind the pills.

```
┌────────────────────────────────────────────────────────┐
│ [Search] [Saved]                  [Time] [Clouds]      │
│                                   [Focal] [DoF]        │
│                                                        │
│            ┌──────────────────────────────┐            │
│            │                              │            │
│            │     <EditorCanvas />         │            │
│            │     (white-bordered)         │            │
│            │                              │            │
│            └──────────────────────────────┘            │
│                                                        │
│                                          [Gallery]     │
│ [Graphics Editor] [24×36] [Preview]   [AI Render][Pic] │
└────────────────────────────────────────────────────────┘
```

### Background

Black canvas with crosshair-grid pattern. Implemented via repeating CSS
background:

```css
body.mock-mounted #mock-root {
  background: #0a0a0a;
  background-image:
    linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: 32px 32px;
}
```

A center-cross marker glyph (`+`) repeats every 32px for the dotted-grid
look in the screenshot — implemented as an SVG `background-image` overlaid
on top of the line grid, repeated at the same 32px cadence.

### Canvas framing

The canvas container is centered with a 4px white border (`box-shadow: 0
0 0 4px #fff`) and respects `aspectAtom` for its width/height ratio. The
existing `--ratio` CSS custom property pattern (animated via @property
on aspect change) is reused unchanged.

## Pill catalog

All pills are absolutely positioned within their cluster. Cluster
containers sit at fixed offsets (top: 16px, left: 16px, etc.).

### Top-left cluster

| Pill | Icon | Label source | Behavior |
|------|------|--------------|----------|
| Search | magnifier | current location's `display_name` (Nominatim) | Click → expands to typed input. On Enter → Nominatim fetch → `dispatchFlyTo({ lat, lng })` + atom updates (lifted from `EnvironmentSection.onLocationKeyDown`). |
| Saved | pin | "Saved" + count badge | Click → popover with saved-view list. Click a row → fires `load-view`. Each row has a small `×` to fire `delete-view`. Footer button: "Save current view" → fires `save-view`. |

### Top-right cluster

| Pill | Icon | Label source | Behavior |
|------|------|--------------|----------|
| Time | sun | `fmtHour(timeOfDay)` | Drag scrubber. Mousedown captures pointer, mousemove maps Δx (1px = 0.05 hours) to `setTimeOfDay`, clamped to `todRange` (sunrise/sunset unless `todUnlockedAtom`). |
| Clouds | cloud | "Clouds" | Toggle: click → `setClouds({ ...clouds, on: !clouds.on })`. Hover popover (when on) with: Coverage slider, Speed slider, Shadows toggle, Pause toggle. |
| Focal | camera | `${focal}mm` | Drag scrubber. Same drag mechanics as Time; maps to focal length atom (read by Camera section's existing `fov-change` event listener). 1px ≈ 0.5mm. Range 18–200. |
| DoF | aperture | `DoF: ON` / `DoF: OFF` | Toggle: click → `setDoF({ ...dof, on: !dof.on })`. Hover popover (when on) with: Tightness slider (`dof.tightness`), Pop slider (`dof.focusColorPop`), Blur slider (`dof.blur`). |

### Bottom-left cluster

| Pill | Icon | Label source | Behavior |
|------|------|--------------|----------|
| Graphics Editor | pencil | "Graphics Editor" | Click → `window.dispatchEvent(new Event('toggle-graphic-editor'))` (existing event). |
| Aspect | — | `${w} × ${h}` from `aspectAtom` | Click → popover with the aspect options (mirrors Canvas section's grid). Click an option → updates `aspectAtom`. |
| Poster Preview | frame | "Preview" | Toggle: click → `setModals((m) => ({ ...m, posterPreview: !m.posterPreview }))`. Reuses existing `PosterPreviewModal`. Pill is in the on-state when `modals.posterPreview` is true. |

### Bottom-right cluster

The cluster is split into two rows:

- **Upper row (gallery only):** `Gallery` pill — opens `modalsAtom.gallery`.
- **Lower row:** `AI Render` + `Take a picture`, side by side.

| Pill | Icon | Label source | Behavior |
|------|------|--------------|----------|
| Gallery | image | "Gallery" + count badge | Click → `setModals({ ...m, gallery: true })`. |
| AI Render | sparkle | "AI Render" | Click → opens `AIRenderModal` (new, see below). |
| Take a picture | camera | "Take a picture" | Click → `window.dispatchEvent(new Event('quick-download'))`. Uses existing one-shot export path. |

## AIRenderModal

New file `src/pages/mock/modals/AIRenderModal.jsx`. Open state lives on a
new local atom in `MockEditorShell` (or extends `modalsAtom` with an
`aiRender` slot — preferred for consistency with how the gallery modal
is gated; let's do the latter).

### Layout

A right-side sheet (≈420px wide) sliding in from the right. Sections:

1. **Header:** "AI Render" + close ×.
2. **Inputs:** Gemini API key (password input, persists to
   `mapposter3d_gemini_key` localStorage), prompt input.
3. **Preset grid:** the full `PRESET_CATS` (28 presets in 4 categories),
   reused verbatim from `ExportSection.jsx`. Lift `PRESET_CATS` into
   `src/pages/mock/modals/aiPresets.js` so both `/app` and `/mock` can
   import from one place. (Replace the literal in `ExportSection.jsx`
   with the new import — minor refactor, no behavior change.)
4. **Resolution row:** select 1× / 2× / 3× / 4× → `exportResolutionAtom`.
5. **Action buttons:** "Generate all" → fires `generate-all`,
   "Add to queue" → fires `add-to-queue`. Same as existing.
6. **Queue list:** reads `queueAtom`, renders the same queue-item rows
   `ExportSection` does. Clicking a `done` job opens the gallery +
   lightbox via the same `openQueueJob` logic (lifted into a small
   helper `src/pages/mock/utils/openQueueJob.js` so both `/app` and
   `/mock` can use it).
7. **Footer:** "Clear done" / "Clear all" → fire `queue-clear-done` /
   `clear-queue`.

### Atoms touched

- `aiPromptAtom`, `aiPresetAtom`, `aiApiKeyAtom`, `exportResolutionAtom`,
  `queueAtom` (read), `galleryEntriesAtom` (read for queue→gallery jump),
  `modalsAtom` (read+write), `lightboxEntryAtom` (write).

## State / data flow

No new global state. The pills are pure projections of existing atoms:

```
atoms ──► pills ──► click/drag handlers ──► atom setters or events ──► Scene
```

The Scene's `useFrame` reads from `sceneRef` as today (no change). All
interactions are atom writes or `window.dispatchEvent` calls — exactly the
same surface area `/app` uses.

## Drag-on-pill mechanics

Used by Time and Focal pills.

```js
function useDragScrub({ value, setValue, min, max, scale }) {
  // pointerdown on pill → setPointerCapture, record startX + startValue
  // pointermove → next = clamp(startValue + (e.clientX - startX) * scale, min, max)
  //               setValue(next)
  // pointerup → release capture
  // cursor: 'ew-resize' on the pill while dragging
}
```

A small drag threshold (~3px) before any value change distinguishes
click (open popover) from drag.

For Time, scale = 0.05 hours/px; for Focal, scale = 0.5 mm/px. Both can
be inverted-shift-modified later if desired (out of scope now).

## Hover popover mechanics

Used by Clouds and DoF.

- Pill has `onPointerEnter` / `onPointerLeave`. A 150ms delay before
  unmount lets the cursor cross between pill and popover without flicker.
- Popover is positioned beneath the pill, anchored to the pill's right
  edge (so it stays inside the viewport in the top-right cluster).
- Popover is keyboard-accessible — focusing the pill (Tab) opens it; Esc
  closes; tab-trap keeps focus inside until close.

## Body / chrome details

- `<body class="mock-mounted">` adds the dark background + grid.
- Pills: `background: rgba(0, 0, 0, 0.55); backdrop-filter: blur(20px) saturate(1.2);`
  border: `1px solid rgba(255,255,255,0.08)`, padding `8px 14px`, radius `999px`,
  font: 12px/1 system-ui, `color: rgba(255,255,255,0.85)`. Same vendor-prefix
  rule from `vite.deploy.config.js` (`cssMinify: 'esbuild'`) handles
  `-webkit-backdrop-filter` correctly.

## Tests

- `src/pages/mock/__tests__/MockEditorShell.test.jsx` — renders without
  crashing, all 11 pills present in DOM.
- `src/pages/mock/__tests__/dragPill.test.jsx` — pointer events on the
  Time pill update `timeOfDayAtom`.
- `scripts/smoke.js` — add a check that `/mock` loads (production build),
  pills render, no console errors, dragging the time pill updates the
  scene's lighting.

No new event-contract tests — the events themselves are unchanged.

## Risks / open questions

1. **Session persistence shares `/app` and `/mock`.** Both routes restore
   from the same `mapposter3d_session` localStorage key. That's a feature
   (you can hop between routes mid-session) but means `/mock` will show
   whatever camera/time you last set in `/app`. Acceptable for an
   exploratory route; revisit if the test users find it confusing.
2. **`useGraphicEditor` lazy-loads Fabric.js.** First click on the
   Graphics Editor pill triggers the same fetch as in `/app` — fine.
3. **Hover popovers don't work on touch.** `/mock` is desktop-first for
   this experiment. Mobile gets a fallback: tapping the pill opens the
   popover (no hover needed); tapping the canvas closes it. We'll spec
   that more carefully if `/mock` graduates beyond the prototype.
4. **AI Render modal uses `modalsAtom.aiRender`.** Adding a new slot to
   `modalsAtom` is a one-line change; no migration needed since the atom
   is initialized fresh per session.

## Out of scope

- Migrating `/app` to the new design.
- New AI providers, new export targets, new scene features.
- Any change to the canvas/scene rendering pipeline.

## Done definition

- `/mock` loads in dev and prod builds.
- All 11 pills render and function as documented above.
- `npm run smoke` passes (with new mock check added).
- `npm run lint && npm run test:run` pass.
- Both `/app` and `/mock` work side-by-side without regressions.
