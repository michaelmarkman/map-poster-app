# Saved-View Camera Markers — design

## Goal

Show each saved view on the globe as a tiny 3D camera marker. Click a marker to fly into that view (full restore: camera, time of day, DoF, graphics). Hovering a marker shows the view's name and saved thumbnail. Markers fade out when the camera is high above the scene to avoid clutter, and an editor-cluster pill toggles the whole layer on or off.

## User-facing behavior

- A new pill in the top-right cluster, `Markers: ON | OFF`, next to `DoF` and `Clouds`. Off by default; the user opts in. Persists across sessions.
- When the pill is on:
  - Each saved view renders a small 1990s-style camera mesh at the camera's saved origin, a thin line down to a pin on the ground/building it was looking at, and a pin at the focal world-point.
  - Markers fade based on camera altitude: fully opaque at ≤ 1 km altitude, fully transparent at ≥ 5 km, linear in between.
  - Hovering a marker:
    - Highlights the camera mesh (subtle scale-up + accent emission).
    - Shows a DOM tooltip anchored above the marker with the view name and a 200px-wide thumbnail.
  - Clicking a marker dispatches the existing `restore-view` window event with the saved view as detail. The Scene's existing `restore-view` listener handles the full tween (same path as clicking the saved view in the list).
- When the pill is off: nothing renders, no per-frame work.

## Architecture

### Component: `SavedViewMarkers`

New file: `src/pages/editor/scene/SavedViewMarkers.jsx`.

R3F component mounted inside `<Scene>` alongside `<Globe>` (so it lives inside `<Atmosphere>` and is subject to the same lighting/post-process pipeline). Subscribes to:
- `savedViewsAtom` — the array of saved views.
- `savedViewMarkersOnAtom` — new boolean.

When the toggle is off, the component returns `null` and there's no per-frame cost. When on, it renders a list of `<SavedViewMarker view={view} />` siblings.

### Component: `SavedViewMarker`

A single saved-view marker. For each view, the group contains:

1. **Camera mesh** — `useGLTF('/camera-models/1990s_low_poly_camera.glb')` loaded once and reused via `<primitive object={clonedScene} />` per marker. Positioned at `view.camera.position`. Oriented with `lookAt(focalWorld)`. World-scale: ~50m body, scaled uniformly so it stays visible at typical aerial altitudes (3D-Tiles scenes here run from ~500 m to ~10 km altitude).
2. **Frustum line** — a `<line>` with two vertices: `[view.camera.position, focalWorld]`, stroke colour `#c8b897` (the editor's cream accent), opacity tracking the marker's altitude-fade.
3. **Ground pin** — small cone (`<coneGeometry>`, ~5m radius, ~12m tall) at `focalWorld`, pointed up, same accent colour.

The whole group's opacity is driven by the altitude-fade (see *Visibility*).

### State: `savedViewMarkersOnAtom`

New atom in `src/pages/editor/atoms/sidebar.js`:

```js
export const savedViewMarkersOnAtom = atom(false)
```

Persists via the existing `useSessionPersistence` hook (the same hook that already persists `cloudsAtom`, `dofAtom`, `bloomAtom`, etc.). Add `savedViewMarkersOnAtom` to the hook's read/write list; no new localStorage key is introduced.

### Toggle pill

`src/pages/mock/components/ClusterTopRight.jsx` — add a `HoverPopoverPill` (or a simpler pill if no popover is needed) with the camera-icon glyph, label `Markers: ${on ? 'ON' : 'OFF'}`. `onToggle` flips `savedViewMarkersOnAtom`. No popover content for now (just a click-to-toggle pill).

## Computing the focal-world point

Saved views store `focalUV` (the [0..1] screen UV the user tapped or the default 0.5,0.5) but not the resolved world point. We compute it lazily per marker on mount.

Algorithm in `SavedViewMarker`:

1. On mount (and again if `view.focalUV` or `view.camera.position` changes), build a virtual `THREE.Camera` at `view.camera.position` with `view.camera.quaternion`, `view.camera.fov`.
2. Set up a `Raycaster` with NDC = `(focalUV.x * 2 - 1, focalUV.y * 2 - 1)`.
3. `raycaster.setFromCamera(ndc, virtualCamera)`.
4. Intersect against the live tileset meshes (`scene.children`) — apply the same name-based filter Scene.jsx uses to skip atmosphere/cloud/ellipsoid shells, accept only hits within 20 km of the virtual camera.
5. If a hit lands, cache the point as `focalWorld`.
6. If no hit (e.g., view aimed at sky, or tileset hadn't loaded yet for this region) fall back to "drop straight down from camera to the WGS84 ellipsoid surface" — never makes the marker invisible, just less anchored to a building.

Cache the result on a `useRef` so subsequent renders don't re-raycast unless `view.focalUV` or `view.camera.position` changes. Recompute on tileset-loaded events (optional later refinement; not in v1).

## Visibility / altitude fade

In `SavedViewMarker`'s `useFrame`:

```js
const altitude = camera.position.length() - EARTH_RADIUS_M
const t = clamp((altitude - 1000) / (5000 - 1000), 0, 1)
const opacity = 1 - t  // 1 at ≤1km, 0 at ≥5km
```

Apply to all material opacities (camera mesh, line, pin). Below `0.05` opacity, also disable pointer events on the marker so the user can't accidentally click an invisible target.

## Interaction

Pointer events on the camera mesh (`onPointerOver`, `onPointerOut`, `onClick`):

- `onPointerOver` → `setHoveredId(view.id)`; cursor becomes pointer.
- `onPointerOut` → `setHoveredId(null)`; cursor reset.
- `onClick` → `window.dispatchEvent(new CustomEvent('restore-view', { detail: view }))`.

On click, the Scene's existing `restore-view` handler does the rest. We do *not* close any panels or change UI state from the marker click — the Scene tween itself is the feedback.

`hoveredId` lives in the parent `SavedViewMarkers` (one tooltip at a time). 

## Hover tooltip

A DOM overlay (not a 3D plane). Tooltip renders inside the editor shell, positioned via `vector.project(camera)` to convert the marker's camera-origin world position into screen-space pixels each frame.

Layout:
- Cream-glass card matching `mock-popover` style (`rgba(20,15,12,0.95)` background, soft border, `backdrop-filter: blur(20px)`).
- Top: `<img>` with the saved view's `thumbnail` data-URL, fixed 200px width, auto height.
- Below: the view's `name` in Inter 13px.
- Anchored above-right of the marker; flips below if it would clip the top edge.

Uses standard React + DOM, not Drei's `<Html>` — gives us full control over CSS and avoids the perf overhead of Drei's reconciler-inside-Drei pattern.

Tooltip is rendered once at the `SavedViewMarkers` level, conditionally on `hoveredId !== null`. Its position is computed in a `useFrame` callback that writes into a `ref.current.style.transform` directly — bypasses React re-renders for the per-frame screen-position update.

## File changes

### New files

- `src/pages/editor/scene/SavedViewMarkers.jsx` — both `SavedViewMarkers` (the parent + tooltip) and `SavedViewMarker` (one-per-view) live here. Single file; component is small and the two pieces are tightly coupled.
- `public/camera-models/1990s_low_poly_camera.glb` — copied from `/Users/michaelmarkman/Documents/map-poster-app/camera models/1990s_low_poly_camera.glb`. Folder renamed to remove the space (URL safety).

### Modified files

- `src/pages/editor/atoms/sidebar.js` — add `savedViewMarkersOnAtom`.
- `src/pages/editor/scene/Scene.jsx` — import + mount `<SavedViewMarkers />` inside `<Atmosphere>`, gated on the atom (component handles `null` return internally; mount unconditionally).
- `src/pages/mock/components/ClusterTopRight.jsx` — add the toggle pill.
- `src/pages/editor/hooks/useSessionPersistence.js` — include `savedViewMarkersOnAtom` in the persisted state alongside the existing layer toggles (`cloudsAtom`, `dofAtom`, `bloomAtom`).

## Edge cases

- **No saved views** — component renders nothing (empty list). Toggle pill stays clickable but does nothing visible.
- **Saved view from before this feature** — has no `focalWorld` cached. Lazy raycast covers it.
- **Tileset hasn't loaded the region** — raycast misses, falls back to ellipsoid drop. Marker still appears but the pin is on flat earth.
- **Saved view's focalUV resolves to sky** — same fallback (ellipsoid drop). The frustum line goes nearly straight down which reads as "I was looking at the horizon."
- **Marker overlap (two views from very close camera positions)** — accept the overlap in v1. Real-life use case is probably a handful of views in different parts of the city.
- **Many views (50+)** — each `useGLTF` call returns the same loaded GLB; cloning the scene per marker is cheap. The per-frame opacity write is one material `.opacity =` per marker — cheap. If perf becomes an issue at 100+ views, instance the meshes; not in v1.
- **Click during a fly-to** — the existing `restore-view` handler interrupts any in-flight tween (same as clicking the list).

## Out of scope (v1)

- Editing markers in place (rename, delete from the marker — uses existing list).
- Multi-marker batch fly-through ("show me all views in sequence").
- Per-marker visibility or styling (some on, some off).
- Marker color reflecting the view's time-of-day or status.
- Drag-to-reposition.

## Testing

- Smoke test: open `/app`, save 2 views from different positions, toggle markers on, verify both appear, hover one (tooltip + thumbnail visible), click → camera flies to that view.
- Edge: toggle on with zero saved views (no error, no markers).
- Edge: save a view aimed at sky (focalUV with no geometry behind it) — marker still renders, pin lands on the ground projection.
- Altitude fade: zoom out to >5km altitude → markers fade to invisible; zoom back in → reappear.
- Persistence: toggle on, reload, expect markers to still be on.

## Build sequence

1. New atom + persistence wiring.
2. Toggle pill wired to atom; verify it persists across reload.
3. Copy GLB into `public/camera-models/`. Verify static path serves.
4. `SavedViewMarkers` component skeleton (returns null, no markers yet) mounted in Scene.
5. Static markers — render the camera GLB at `view.camera.position` for every saved view, no frustum/pin yet, no fade. Verify they appear in the right places.
6. Frustum line + ground pin via lazy raycast.
7. Altitude fade + pointer-events gate.
8. Hover state in the parent + tooltip overlay (DOM, screen-projected).
9. Click → dispatch `restore-view`.
10. Polish: cursor, hover highlight on the camera mesh, edge cases.
