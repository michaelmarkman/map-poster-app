# Mobile Compatibility Plan — Poster v3 Editor

Status: **Phase 1–4 shipped** (commits 8b1bba9, 478ff74, 74129f3, a12046c
on main). Phase 5 (PWA manifest, iPad-as-desktop, `navigator.share`) open.
Scope at authoring time: `prototypes/poster-v3-ui.html` + `prototypes/poster-v3-ui.jsx`.
The work has since been carried forward into `src/pages/editor/` as part
of the React migration — the responsive rules live in `src/pages/editor/styles/responsive.css`.

## 1. Audit — what breaks today

Two-pane desktop layout: fixed 280px left sidebar + centered 3D canvas. Viewport meta exists (`poster-v3-ui.html:5`); every other layout choice is desktop-first.

| Issue | Evidence |
| --- | --- |
| Sidebar hard-coded 280px, `position: fixed`, inset 18px → covers ~72% of a 390px phone | `poster-v3-ui.html:85-101` |
| Canvas `min(..., calc(100vw - 360px))`, `#main` padding-left 320px → <360px collapses to zero/negative | `:654-661`, `:618` |
| Gallery grid min tile 220px (large 360px) → wider than a phone | `:1265-1270` |
| Lightbox action buttons at `right: 160/260/360/460px` → Share off-screen, overlaps | `:2335-2339` |
| Time Machine slider 560px (70vw cap), 56px serif year label → stack overflows | `:1483-1486`, `:1461-1470` |
| `fitPosterScene` hard-codes sidebar width 320 → non-desktop layouts mis-center | `poster-v3-ui.jsx:2885-2902` |
| Touch targets under spec: toggles 26×15, slider thumbs 10px, section pad 22px → below iOS 44pt | `:261-282`, `:238-250`, `:206-215` |
| Right-side Graphic Editor drawer 260px → with the left sidebar also open the canvas is invisible | `:1794-1803` |
| `#editor-toolbar` no `env(safe-area-inset-bottom)` → collides with Safari bottom chrome | `:1723-1744` |
| No responsive plumbing — only two ad-hoc `window.innerWidth` calls | `poster-v3-ui.jsx:2888-2890` |
| `dpr={2}` hard-coded → full-res composition on heavy post-processing | `:1410` |

Good news: `GlobeControls` already handles touch and pinch — see `node_modules/3d-tiles-renderer/src/three/renderer/controls/EnvironmentControls.js:300-498`. It sets `touchAction: 'none'` and implements two-finger pinch/rotate/pan via `PointerTracker`.

## 2. Recommended tier: (c) Pocket editor

**(a)** full parity is a trap — Graphic Editor (Fabric.js overlay), 13-decade Time Machine grid, SSAO/Bloom micro-adjusts, and batch export were designed around a 280px column; porting them all means fighting overflow on every screen, and nobody frames a print-ready poster from a phone. **(b)** view-only is too narrow — the "pick a place, tilt, export" loop is what users show friends on a phone. **(c)** keeps what maps to touch (search, time-of-day, camera tilt via GlobeControls, presets, Quick Download, Gallery) and gates the rest with a desktop-nudge. This sequences cleanly: Phase 1 lands "doesn't break" and (b) falls out as a natural intermediate.

## 3. Breakpoints

| Range | Tier | Sidebar | Canvas | Hidden |
| --- | --- | --- | --- | --- |
| `< 640px` | Phone | Bottom sheet, collapsed | `100vw × 100dvh`, no gutter, no decorative grid | Graphic Editor; right properties drawer; WASD; TM grid view |
| `640–1024px` | Tablet | Off-canvas drawer, 320px, burger-toggled | 24px padding with drawer closed | Graphic Editor gated behind "open on desktop" banner |
| `> 1024px` | Desktop | Current 280px fixed | Current workbench gutter | Nothing |

Use `100dvh` — `100vh` loses the bottom strip when iOS Safari's URL bar collapses.

## 4. Sidebar on mobile — bottom sheet

A left drawer shoves the canvas aside; a bottom sheet keeps it front-and-center while controls surface under the thumb. Sidebar content is already a vertical list of sliders/toggles, which reads naturally in a sheet. Top tabs would fight `canvas-hud` (`poster-v3-ui.html:748-786`) and eat landscape vertical space.

Shape: 56px handle bar showing section dots + active name. Tap → peek (40% vh), drag → half (65%) / full (95%). Section heads (`.section-head`) become horizontal tabs *inside* the sheet so users don't scroll through all five. Dropdown panels (Map Style, Render Styles, Saved Views) stay as in-sheet expanding rows.

## 5. Touch interactions

GlobeControls handles globe gestures already. Remaining work:

- `ClickToFocus` (`poster-v3-ui.jsx:319-339`) uses an 8px click-vs-drag threshold; raise to 12–14px on `matchMedia('(pointer: coarse)')` or key off a `click` event, otherwise small-movement taps both focus *and* start an orbit.
- Editor route only: tighten viewport to `maximum-scale=1, user-scalable=no` so pinch on the globe doesn't page-zoom. Don't do this globally.
- HUD overlays already `pointer-events: none` (`:750-759`).

## 6. Performance

Pipeline: `Clouds + AerialPerspective + optional Bloom + optional SSAO + LensFlare + CustomDof + SMAA + Dithering` at `dpr={2}` (`poster-v3-ui.jsx:586-603`, `1410`). Mid-range phones will thermal-throttle quickly.

| Setting | Desktop | Mobile | Why |
| --- | --- | --- | --- |
| `dpr` | 2 | `min(1.5, devicePixelRatio)` | Halves fragment work — biggest win. |
| Bloom / SSAO / Lens flare | opt | off, hidden | Decorative, costly. |
| Cloud coverage | user | cap 0.3 | Tames sky raymarch. |
| Cloud shadows | on | off | Shadow raymarch is the worst cost. |
| Clouds `qualityPreset` | `'high'` (`poster-v3-ui.jsx:590`) | `'low'` or `'medium'` | Confirm enum in `@takram/three-clouds`. |
| DoF blur passes | 4 | 2 | Still reads as tilt-shift. |
| SMAA | on | off | Redundant at 1.5 DPR. |
| `#main` decorative grid/radials | on | off | `poster-v3-ui.html:625-644` paints for nothing when canvas fills viewport. |

Add a frame-rate guard: if `useFrame` averages >33ms over ~120 frames, auto-disable Clouds with a toast.

## 7. Sequenced rollout

**Phase 1 — doesn't break (1–2d).** `maximum-scale=1` on editor only. `@media (max-width: 1024px)` stacks sidebar above canvas as a collapsed top bar, canvas uses `calc(100dvh - 56px)`, `fitPosterScene` reads sidebar offset at runtime. No new features.

**Phase 2 — bottom sheet + touch targets (3–5d).** Replace top bar with §4 sheet. Toggles 44×26, slider thumbs 18px, section-head padding 16/20 on coarse pointers. Floating Quick Download above the handle. Raise `ClickToFocus` threshold.

**Phase 3 — perf + feature gating (2–3d).** Apply §6 defaults behind one `isMobile` detector. Hide Graphic Editor with a desktop-nudge. Simplify Time Machine to slider + single image on mobile. Collapse lightbox buttons into a single ⋯ menu or into the sheet.

**Phase 4 — gallery + polish (2–3d).** Gallery `minmax(140px, 1fr)` on phones, swipe carousel in lightbox. `env(safe-area-inset-bottom)` on toolbar/sheet/status. Landscape tweaks for <500px tall.

**Phase 5 — optional.** PWA manifest, iPad-treated-as-desktop, `navigator.share` where supported.

## 8. Anti-goals / YAGNI

- **No native app.** Capacitor wrapping adds app-store friction for zero user benefit.
- **No offline-first.** 3D Tiles are the product; a stale cache is worse than a clear "needs connection" state.
- **No mobile Graphic Editor port.** Fabric.js with thumb-sized handles is worse than none.
- **No sidebar rewrite in React.** The JSX owns R3F; the sidebar is static HTML wired up in `poster-v3-ui.jsx:695+`. Build the sheet as a sibling.
- **No "simple mode" toggle on desktop.** Driven by viewport alone — manual toggles double QA surface.
- **Don't chase 60fps on low-end Android.** 30fps with locked DPR is the realistic target; rely on the frame-rate guard.

## Open questions

1. `@takram/three-clouds/r3f` `qualityPreset` enum values — confirm in Phase 3.
2. `navigator.deviceMemory` isn't on iOS Safari; OR the mobile detector with `matchMedia('(pointer: coarse)')`.
3. Pro paywall slot (`poster-v3-ui.html:2243-2248`, currently hidden) should reserve a spot in the sheet so Phase 5 doesn't need a relayout.
