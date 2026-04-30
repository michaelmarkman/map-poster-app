# Saved-View Camera Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every saved view as a tiny 3D camera marker on the globe (camera mesh at the saved camera origin, frustum line down to a ground pin at the focal point). A toggle pill turns the layer on/off; markers fade with altitude; hovering shows a tooltip with the view's name + thumbnail; clicking flies the camera into that view.

**Architecture:** A new R3F component `<SavedViewMarkers>` lives inside `<Scene>` alongside `<Globe>`. It reads `savedViewsAtom` + a new `savedViewMarkersOnAtom`, renders one `<SavedViewMarker>` group per view (GLTF camera mesh + line + cone), and lazy-resolves each view's focal-world point with a virtual-camera raycast. A DOM tooltip lives at the `SavedViewMarkers` level and projects a screen position from the hovered marker each frame. Clicks dispatch the existing `restore-view` event so the existing handler does the tween.

**Tech Stack:** React 19, R3F (`@react-three/fiber`), `@react-three/drei` (`useGLTF`, `Line`), Jotai, Three.js (`Raycaster`, `Vector3`), Vite static assets, Vitest + RTL for tests.

---

## File structure

**New files:**
- `public/camera-models/1990s_low_poly_camera.glb` — the GLB asset (copied from `/Users/michaelmarkman/Documents/map-poster-app/camera models/`).
- `src/pages/editor/scene/savedViewMarkerMath.js` — pure helpers (altitude→opacity, raycast for focal world). Extracted so they can be unit-tested without R3F.
- `src/pages/editor/scene/SavedViewMarkers.jsx` — both the parent `<SavedViewMarkers>` (manages hover state + tooltip) and `<SavedViewMarker>` (one per view). Single file because the two pieces are tightly coupled and each is small.
- `src/pages/editor/__tests__/savedViewMarkerMath.test.js` — unit tests for the pure helpers.
- `src/pages/editor/__tests__/savedViewMarkersAtom.test.js` — atom default + persistence test.
- `src/pages/mock/__tests__/MarkersPill.test.jsx` — pill render/toggle test.

**Modified files:**
- `src/pages/editor/atoms/sidebar.js` — add `savedViewMarkersOnAtom`.
- `src/pages/editor/hooks/useSessionPersistence.js` — read/write `savedViewMarkersOnAtom` alongside other layer toggles.
- `src/pages/editor/scene/Scene.jsx` — mount `<SavedViewMarkers />` inside `<Atmosphere>`.
- `src/pages/mock/components/ClusterTopRight.jsx` — add Markers pill next to Clouds.
- `.gitignore` — confirm `public/camera-models/*.glb` isn't blocked (the existing `public/**/*.png` exception only covers PNGs; GLBs aren't in any rule, so they should pass through, but verify).

---

## Task 1: Stage the GLB asset

**Files:**
- Create: `public/camera-models/1990s_low_poly_camera.glb`

- [ ] **Step 1: Copy the GLB into the worktree's public dir**

```bash
mkdir -p public/camera-models
cp "/Users/michaelmarkman/Documents/map-poster-app/camera models/1990s_low_poly_camera.glb" public/camera-models/1990s_low_poly_camera.glb
```

- [ ] **Step 2: Verify it's not gitignored**

Run: `git check-ignore -v public/camera-models/1990s_low_poly_camera.glb`
Expected: empty output (file is trackable). If a rule blocks it, edit `.gitignore` to add `!public/camera-models/*.glb`.

- [ ] **Step 3: Verify Vite serves it**

Run dev server (`npm run dev`) in the background, then:
```bash
curl -sI http://localhost:5173/camera-models/1990s_low_poly_camera.glb | head -2
```
Expected: `HTTP/1.1 200` and `Content-Type: model/gltf-binary` (or `application/octet-stream`).

- [ ] **Step 4: Commit**

```bash
git add public/camera-models/1990s_low_poly_camera.glb
git commit -m "Add 1990s low-poly camera GLB for saved-view markers"
```

---

## Task 2: New atom — `savedViewMarkersOnAtom`

**Files:**
- Modify: `src/pages/editor/atoms/sidebar.js`
- Test: `src/pages/editor/__tests__/savedViewMarkersAtom.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/pages/editor/__tests__/savedViewMarkersAtom.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { createStore } from 'jotai'
import { savedViewMarkersOnAtom } from '../atoms/sidebar'

describe('savedViewMarkersOnAtom', () => {
  it('defaults to false', () => {
    const store = createStore()
    expect(store.get(savedViewMarkersOnAtom)).toBe(false)
  })

  it('round-trips through set/get', () => {
    const store = createStore()
    store.set(savedViewMarkersOnAtom, true)
    expect(store.get(savedViewMarkersOnAtom)).toBe(true)
    store.set(savedViewMarkersOnAtom, false)
    expect(store.get(savedViewMarkersOnAtom)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/pages/editor/__tests__/savedViewMarkersAtom.test.js`
Expected: FAIL with `savedViewMarkersOnAtom is not exported`.

- [ ] **Step 3: Add the atom**

Edit `src/pages/editor/atoms/sidebar.js`. After the existing `aiCleanArtifactsAtom` block, add:

```js
// Toggles the in-scene layer of camera markers for saved views — see
// docs/superpowers/specs/2026-04-30-saved-view-camera-markers-design.md.
// Off by default; persists across sessions via useSessionPersistence.
export const savedViewMarkersOnAtom = atom(false)
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/pages/editor/__tests__/savedViewMarkersAtom.test.js`
Expected: 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/editor/atoms/sidebar.js src/pages/editor/__tests__/savedViewMarkersAtom.test.js
git commit -m "Add savedViewMarkersOnAtom (off by default)"
```

---

## Task 3: Wire atom into session persistence

**Files:**
- Modify: `src/pages/editor/hooks/useSessionPersistence.js`
- Test: `src/pages/editor/__tests__/useSessionPersistence.test.js` (extend existing)

- [ ] **Step 1: Read the existing persistence test**

Open `src/pages/editor/__tests__/useSessionPersistence.test.js`. Scan for the test that verifies `clouds` round-trips. Mirror its shape for the new field.

- [ ] **Step 2: Add a failing test**

Append a new test inside the existing top-level `describe`:

```js
it('persists savedViewMarkersOn across reload', () => {
  const store = createStore()
  store.set(savedViewMarkersOnAtom, true)
  // Save…
  saveSession(store)
  // Wipe…
  store.set(savedViewMarkersOnAtom, false)
  // Restore…
  restoreSession(store)
  expect(store.get(savedViewMarkersOnAtom)).toBe(true)
})
```

(Adjust function names to match what the existing tests in the file use — read the file and copy their pattern. Add `import { savedViewMarkersOnAtom } from '../atoms/sidebar'` to the file's imports.)

- [ ] **Step 3: Run test, verify it fails**

Run: `npx vitest run src/pages/editor/__tests__/useSessionPersistence.test.js`
Expected: FAIL — the new test fails because the value isn't saved/restored.

- [ ] **Step 4: Wire the atom into useSessionPersistence**

Open `src/pages/editor/hooks/useSessionPersistence.js`.

a) Add to imports (alongside `cloudsAtom`, `dofAtom`):

```js
import {
  cloudsAtom,
  dofAtom,
  savedViewMarkersOnAtom,
} from '../atoms/sidebar'
```

(adjust path if `cloudsAtom` is imported from `atoms/scene` — match the file's existing pattern; `savedViewMarkersOnAtom` lives in `atoms/sidebar` per Task 2.)

b) Inside the hook body, alongside `const clouds = useAtomValue(cloudsAtom)`:

```js
const savedViewMarkersOn = useAtomValue(savedViewMarkersOnAtom)
```

c) Inside the hook body, alongside `const setClouds = useSetAtom(cloudsAtom)`:

```js
const setSavedViewMarkersOn = useSetAtom(savedViewMarkersOnAtom)
```

d) In the **save** path (where the persisted state object is constructed), include the field:

```js
const persisted = {
  ...,
  clouds,
  savedViewMarkersOn,
}
```

e) In the **restore** path (where atoms are populated from persisted state), set it:

```js
if (typeof persisted.savedViewMarkersOn === 'boolean') {
  setSavedViewMarkersOn(persisted.savedViewMarkersOn)
}
```

(The `typeof === 'boolean'` guard handles old session blobs that pre-date this field — they restore as undefined, which would otherwise overwrite the default with `undefined`.)

- [ ] **Step 5: Run test, verify it passes**

Run: `npx vitest run src/pages/editor/__tests__/useSessionPersistence.test.js`
Expected: PASS, including the new test.

- [ ] **Step 6: Commit**

```bash
git add src/pages/editor/hooks/useSessionPersistence.js src/pages/editor/__tests__/useSessionPersistence.test.js
git commit -m "Persist savedViewMarkersOn across sessions"
```

---

## Task 4: Toggle pill in ClusterTopRight

**Files:**
- Modify: `src/pages/mock/components/ClusterTopRight.jsx`
- Test: `src/pages/mock/__tests__/MarkersPill.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/pages/mock/__tests__/MarkersPill.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { savedViewMarkersOnAtom } from '../../editor/atoms/sidebar'
import ClusterTopRight from '../components/ClusterTopRight'

function withStore(initial = false) {
  const store = createStore()
  store.set(savedViewMarkersOnAtom, initial)
  return store
}

describe('Markers pill', () => {
  it('renders OFF label when atom is false', () => {
    render(<Provider store={withStore(false)}><ClusterTopRight /></Provider>)
    expect(screen.getByRole('button', { name: /Markers: OFF/ })).toBeInTheDocument()
  })

  it('renders ON label when atom is true', () => {
    render(<Provider store={withStore(true)}><ClusterTopRight /></Provider>)
    expect(screen.getByRole('button', { name: /Markers: ON/ })).toBeInTheDocument()
  })

  it('flips the atom when clicked', () => {
    const store = withStore(false)
    render(<Provider store={store}><ClusterTopRight /></Provider>)
    fireEvent.click(screen.getByRole('button', { name: /Markers: OFF/ }))
    expect(store.get(savedViewMarkersOnAtom)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/pages/mock/__tests__/MarkersPill.test.jsx`
Expected: FAIL — no element matching `/Markers: OFF/`.

- [ ] **Step 3: Add the pill to ClusterTopRight**

Open `src/pages/mock/components/ClusterTopRight.jsx`.

a) Add to imports:

```jsx
import { CloudIcon, ApertureIcon, CameraIcon } from './icons'
import { cloudsAtom, dofAtom } from '../../editor/atoms/scene'
import { savedViewMarkersOnAtom } from '../../editor/atoms/sidebar'
```

b) Inside the component, alongside the existing `useAtom` lines:

```jsx
const [markersOn, setMarkersOn] = useAtom(savedViewMarkersOnAtom)
```

c) Add a new pill after the Clouds pill (before the closing `</div>`):

```jsx
<HoverPopoverPill
  icon={<CameraIcon />}
  label={`Markers: ${markersOn ? 'ON' : 'OFF'}`}
  active={markersOn}
  onToggle={() => setMarkersOn((v) => !v)}
/>
```

d) If `CameraIcon` doesn't exist in `./icons`, add a minimal one in `src/pages/mock/components/icons.jsx`:

```jsx
export function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7h3l2-2h8l2 2h3v12H3z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/pages/mock/__tests__/MarkersPill.test.jsx`
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/mock/components/ClusterTopRight.jsx src/pages/mock/components/icons.jsx src/pages/mock/__tests__/MarkersPill.test.jsx
git commit -m "Add Markers pill to /app cluster (toggles savedViewMarkersOnAtom)"
```

---

## Task 5: Pure helpers — `savedViewMarkerMath.js`

**Files:**
- Create: `src/pages/editor/scene/savedViewMarkerMath.js`
- Test: `src/pages/editor/__tests__/savedViewMarkerMath.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/pages/editor/__tests__/savedViewMarkerMath.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { altitudeToOpacity } from '../scene/savedViewMarkerMath'

describe('altitudeToOpacity', () => {
  it('returns 1 when below the lower threshold', () => {
    expect(altitudeToOpacity(500)).toBe(1)
    expect(altitudeToOpacity(1000)).toBe(1)
  })

  it('returns 0 when above the upper threshold', () => {
    expect(altitudeToOpacity(5000)).toBe(0)
    expect(altitudeToOpacity(7500)).toBe(0)
  })

  it('linearly interpolates between thresholds', () => {
    // halfway between 1000 and 5000 → 0.5 opacity
    expect(altitudeToOpacity(3000)).toBeCloseTo(0.5, 5)
  })

  it('clamps negative altitudes to fully opaque', () => {
    expect(altitudeToOpacity(-50)).toBe(1)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/pages/editor/__tests__/savedViewMarkerMath.test.js`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `src/pages/editor/scene/savedViewMarkerMath.js`:

```js
// Pure helpers for the saved-view marker layer. Kept separate from
// SavedViewMarkers.jsx so the math is unit-testable without an R3F runtime.

// Camera altitude (m above ground/ellipsoid) → marker opacity.
//   ≤ 1km altitude → fully opaque
//   ≥ 5km altitude → fully transparent
//   linear in between
// Picked these values empirically: a city scene reads cleanly below ~1km
// (markers are large enough relative to terrain), and by 5km the camera
// can see a region wide enough that markers cluster into noise.
export const ALT_OPAQUE_BELOW = 1000
export const ALT_TRANSPARENT_ABOVE = 5000

export function altitudeToOpacity(altitudeMeters) {
  if (altitudeMeters <= ALT_OPAQUE_BELOW) return 1
  if (altitudeMeters >= ALT_TRANSPARENT_ABOVE) return 0
  const span = ALT_TRANSPARENT_ABOVE - ALT_OPAQUE_BELOW
  const t = (altitudeMeters - ALT_OPAQUE_BELOW) / span
  return 1 - t
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/pages/editor/__tests__/savedViewMarkerMath.test.js`
Expected: 4/4 PASS.

- [ ] **Step 5: Add focal-world resolver helper**

Append to `src/pages/editor/scene/savedViewMarkerMath.js`:

```js
import { Raycaster, Vector2, PerspectiveCamera, Vector3 } from 'three'

const _ndc = new Vector2()
const _raycaster = new Raycaster()
const _virtualCam = new PerspectiveCamera()

// Given a saved view (camera position + quaternion + fov + focalUV) and the
// live scene graph, raycast from the saved viewpoint through focalUV and
// return the world-space hit point. Returns null on miss (caller falls
// back to ellipsoid drop).
//
// We DON'T move the live camera — we configure a virtual PerspectiveCamera
// with the saved transform and fire the ray from there. That way this can
// run while the user has flown elsewhere; the marker layer doesn't depend
// on the user being at the saved position.
//
// `nameRejectRegex` matches mesh names we consider "shells" (atmosphere,
// clouds, ellipsoid stand-ins). Mirrors the filter in Scene.jsx's
// click-to-focus raycast so we don't lock onto the sky.
export function resolveFocalWorld(view, scene, opts = {}) {
  const maxDist = opts.maxDist ?? 20000
  const nameRejectRegex = opts.nameRejectRegex ?? /atmosphere|cloud|ellipsoid|sky|globe/i

  const cam = view.camera
  if (!cam || !Array.isArray(cam.position) || !Array.isArray(cam.quaternion)) return null

  _virtualCam.position.fromArray(cam.position)
  _virtualCam.quaternion.fromArray(cam.quaternion)
  _virtualCam.fov = cam.fov ?? 37.8
  _virtualCam.aspect = opts.aspect ?? 1
  _virtualCam.near = 1
  _virtualCam.far = 1e7
  _virtualCam.updateProjectionMatrix()
  _virtualCam.updateMatrixWorld(true)

  const uv = view.focalUV ?? [0.5, 0.5]
  _ndc.set(uv[0] * 2 - 1, uv[1] * 2 - 1)
  _raycaster.setFromCamera(_ndc, _virtualCam)

  const hits = _raycaster.intersectObjects(scene.children, true)
  for (const h of hits) {
    const d = _virtualCam.position.distanceTo(h.point)
    if (d < 1 || d > maxDist) continue
    const name = (h.object?.name || '').toLowerCase()
    if (nameRejectRegex.test(name)) continue
    if (h.object?.isAtmosphereMesh || h.object?.isCloudsEffect) continue
    return new Vector3(h.point.x, h.point.y, h.point.z)
  }
  return null
}
```

- [ ] **Step 6: Add a test for resolveFocalWorld**

Append to `src/pages/editor/__tests__/savedViewMarkerMath.test.js`:

```js
import { resolveFocalWorld } from '../scene/savedViewMarkerMath'

describe('resolveFocalWorld', () => {
  function fakeScene() {
    return { children: [] }
  }
  function viewAt(pos = [0, 0, 100]) {
    return {
      camera: { position: pos, quaternion: [0, 0, 0, 1], fov: 60 },
      focalUV: [0.5, 0.5],
    }
  }

  it('returns null when the scene is empty', () => {
    const w = resolveFocalWorld(viewAt(), fakeScene())
    expect(w).toBe(null)
  })

  it('returns null when view has no camera', () => {
    const w = resolveFocalWorld({ focalUV: [0.5, 0.5] }, fakeScene())
    expect(w).toBe(null)
  })

  it('returns null when view.camera lacks position', () => {
    const w = resolveFocalWorld({ camera: { fov: 60 }, focalUV: [0.5, 0.5] }, fakeScene())
    expect(w).toBe(null)
  })
})
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run src/pages/editor/__tests__/savedViewMarkerMath.test.js`
Expected: 7/7 PASS.

- [ ] **Step 8: Commit**

```bash
git add src/pages/editor/scene/savedViewMarkerMath.js src/pages/editor/__tests__/savedViewMarkerMath.test.js
git commit -m "Pure helpers: altitudeToOpacity + resolveFocalWorld"
```

---

## Task 6: SavedViewMarkers skeleton mounted in Scene

**Files:**
- Create: `src/pages/editor/scene/SavedViewMarkers.jsx`
- Modify: `src/pages/editor/scene/Scene.jsx`

This task gets the component on screen as a no-op so we can iterate visually.

- [ ] **Step 1: Write the skeleton**

Create `src/pages/editor/scene/SavedViewMarkers.jsx`:

```jsx
import { useAtomValue } from 'jotai'
import { savedViewsAtom, savedViewMarkersOnAtom } from '../atoms/sidebar'

// Renders a 3D camera marker per saved view. Mounted unconditionally inside
// <Scene> — returns null when the toggle is off so there's zero per-frame
// cost while disabled. See docs/superpowers/specs/2026-04-30-saved-view-
// camera-markers-design.md.
export default function SavedViewMarkers() {
  const on = useAtomValue(savedViewMarkersOnAtom)
  const views = useAtomValue(savedViewsAtom)
  if (!on) return null
  if (!views?.length) return null
  // TODO(next task): per-marker rendering.
  return null
}
```

- [ ] **Step 2: Mount in Scene**

Open `src/pages/editor/scene/Scene.jsx`. Find the `return (` block (around line 599). Add the import at the top alongside the other scene imports:

```jsx
import SavedViewMarkers from './SavedViewMarkers'
```

Inside the return JSX, after `<SubjectListener />` and before `<PostProcessing>`:

```jsx
      <ClickToFocus />
      <SubjectListener />
      <SavedViewMarkers />

      <PostProcessing composerRef={composerRef} dofRef={dofRef}>
```

- [ ] **Step 3: Verify dev server boots without error**

Run dev server: `npm run dev` (background). Visit `http://localhost:5173/app`.
Expected: scene renders identically to before. Toggle the new Markers pill — still nothing visual yet, but no errors in console.

- [ ] **Step 4: Run all unit tests to make sure nothing regressed**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/editor/scene/SavedViewMarkers.jsx src/pages/editor/scene/Scene.jsx
git commit -m "SavedViewMarkers skeleton mounted in Scene (no-op)"
```

---

## Task 7: Render the camera mesh per saved view

**Files:**
- Modify: `src/pages/editor/scene/SavedViewMarkers.jsx`

Goal: load the GLB once, render one instance at each saved view's camera origin, oriented to look at the view's camera target. No frustum, no pin, no fade, no interaction — just the 3D body in the right place.

- [ ] **Step 1: Add GLB preload + per-marker mesh**

Replace the contents of `src/pages/editor/scene/SavedViewMarkers.jsx` with:

```jsx
import { useEffect, useMemo, useRef } from 'react'
import { useAtomValue } from 'jotai'
import { useGLTF } from '@react-three/drei'
import { Quaternion, Vector3 } from 'three'
import { savedViewsAtom, savedViewMarkersOnAtom } from '../atoms/sidebar'

const CAMERA_GLB = '/camera-models/1990s_low_poly_camera.glb'
// World-units. The saved camera position lives in scene-local space but the
// scene is geo-referenced in meters; ~50m makes the mesh visible at typical
// aerial altitudes (200m–5km) without dominating the frame at low altitude.
const MARKER_SCALE = 50

// Drei caches the GLTF; preloading kicks off the fetch before the component
// mounts so first hover doesn't flash the placeholder.
useGLTF.preload(CAMERA_GLB)

export default function SavedViewMarkers() {
  const on = useAtomValue(savedViewMarkersOnAtom)
  const views = useAtomValue(savedViewsAtom)
  if (!on) return null
  if (!views?.length) return null
  return (
    <>
      {views.map((view) => (
        <SavedViewMarker key={view.id} view={view} />
      ))}
    </>
  )
}

function SavedViewMarker({ view }) {
  const { scene: gltfScene } = useGLTF(CAMERA_GLB)
  // Each marker needs its own clone — sharing the same Object3D across
  // multiple <primitive> mounts would re-parent the mesh each frame and
  // only the last one would render.
  const cloned = useMemo(() => gltfScene.clone(true), [gltfScene])

  const position = useMemo(() => {
    const p = view?.camera?.position
    return Array.isArray(p) ? new Vector3(p[0], p[1], p[2]) : null
  }, [view?.camera?.position])

  const quaternion = useMemo(() => {
    const q = view?.camera?.quaternion
    return Array.isArray(q) ? new Quaternion(q[0], q[1], q[2], q[3]) : null
  }, [view?.camera?.quaternion])

  if (!position || !quaternion) return null

  return (
    <group position={position} quaternion={quaternion} scale={MARKER_SCALE}>
      <primitive object={cloned} />
    </group>
  )
}
```

- [ ] **Step 2: Smoke-test in the browser**

With dev server running, open `/app`, click the Markers pill ON.
Save 1–2 views from different camera angles (use the existing Saved-views save button).
Expected: a small camera-shaped GLB appears at each saved camera's location, facing the same direction the camera was when saved.

If it doesn't show up: check the browser console. Most common gotcha — `useGLTF.preload(CAMERA_GLB)` runs at module load, which on Vite SSR-style import-evaluation can throw before `window.fetch` is set up. If you see a preload error, move the call into a `useEffect` inside the component instead.

- [ ] **Step 3: Run unit tests**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/editor/scene/SavedViewMarkers.jsx
git commit -m "SavedViewMarkers: render the GLB at each saved camera origin"
```

---

## Task 8: Add the frustum line + ground pin

**Files:**
- Modify: `src/pages/editor/scene/SavedViewMarkers.jsx`

Goal: per marker, raycast the focal world point lazily, draw a thin line from the camera mesh down to it, and place a small cone at it. Falls back to a vertical ellipsoid drop on miss.

- [ ] **Step 1: Update SavedViewMarker with focal resolution + frustum + pin**

Replace `SavedViewMarker` in `src/pages/editor/scene/SavedViewMarkers.jsx`:

```jsx
import { useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { resolveFocalWorld } from './savedViewMarkerMath'

// ...keep existing imports + top-of-file constants...

const ACCENT = '#c8b897' // editor cream accent
const PIN_RADIUS = 5     // m
const PIN_HEIGHT = 12    // m
const EARTH_RADIUS_M = 6378137

function ellipsoidDrop(positionVec3) {
  // Project the camera origin straight down onto the WGS84 ellipsoid surface
  // (treat scene-local coords as ECEF — that's how the takram atmosphere
  // pipeline configures things). Returns a Vector3 on the sphere.
  const len = positionVec3.length()
  if (len < 1) return positionVec3.clone()
  const scale = EARTH_RADIUS_M / len
  return positionVec3.clone().multiplyScalar(scale)
}

function SavedViewMarker({ view }) {
  const { scene: gltfScene } = useGLTF(CAMERA_GLB)
  const cloned = useMemo(() => gltfScene.clone(true), [gltfScene])
  const liveScene = useThree((s) => s.scene)

  const position = useMemo(() => {
    const p = view?.camera?.position
    return Array.isArray(p) ? new Vector3(p[0], p[1], p[2]) : null
  }, [view?.camera?.position])

  const quaternion = useMemo(() => {
    const q = view?.camera?.quaternion
    return Array.isArray(q) ? new Quaternion(q[0], q[1], q[2], q[3]) : null
  }, [view?.camera?.quaternion])

  // Lazy focal-world resolution. Tries the raycast on mount; falls back to
  // the ellipsoid drop on miss (sky tap, tileset not yet loaded for region).
  // Cached on a ref so we don't re-raycast every render.
  const focalWorldRef = useRef(null)
  useEffect(() => {
    if (!position) return
    const hit = resolveFocalWorld(view, liveScene)
    focalWorldRef.current = hit ?? ellipsoidDrop(position)
    // No deps on liveScene.children — we only resolve once per marker.
    // If the user expects markers to "snap" once tiles finish streaming,
    // re-running here on a tileset-loaded event would be the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.id])

  if (!position || !quaternion) return null

  // Pin position is a world coord — render the pin in WORLD space (a sibling
  // group), not nested inside the position-locked camera group.
  const focalWorld = focalWorldRef.current
  return (
    <>
      <group position={position} quaternion={quaternion} scale={MARKER_SCALE}>
        <primitive object={cloned} />
      </group>
      {focalWorld && (
        <>
          <Line
            points={[position.toArray(), focalWorld.toArray()]}
            color={ACCENT}
            transparent
            opacity={0.5}
            lineWidth={1}
          />
          <mesh position={focalWorld}>
            <coneGeometry args={[PIN_RADIUS, PIN_HEIGHT, 8]} />
            <meshBasicMaterial color={ACCENT} transparent opacity={0.9} />
          </mesh>
        </>
      )}
    </>
  )
}
```

- [ ] **Step 2: Visual verify in the browser**

Reload `/app`, ensure Markers is ON, save a view that points at a building. Toggle off + on.
Expected: each marker shows the camera body, a thin line down to a small cone sitting on the building, both in cream color.

- [ ] **Step 3: Run unit tests**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/editor/scene/SavedViewMarkers.jsx
git commit -m "SavedViewMarkers: add frustum line + ground pin (lazy raycast)"
```

---

## Task 9: Altitude fade + pointer-events gate

**Files:**
- Modify: `src/pages/editor/scene/SavedViewMarkers.jsx`

Goal: marker opacity tracks camera altitude so they fade out when zoomed out. Below ~5% opacity, disable pointer events.

- [ ] **Step 1: Wire opacity into SavedViewMarker**

Add `useFrame` import + opacity logic to `SavedViewMarker`:

```jsx
import { useFrame, useThree } from '@react-three/fiber'
import { altitudeToOpacity } from './savedViewMarkerMath'
```

Inside `SavedViewMarker`, after `const liveScene = ...`:

```jsx
const opacityRef = useRef(1)
const groupRef = useRef(null)
const lineRef = useRef(null)
const pinRef = useRef(null)

useFrame(({ camera }) => {
  // ECEF position length minus Earth radius ≈ altitude above ellipsoid.
  // Same trick used elsewhere in Scene.jsx.
  const altitude = Math.max(camera.position.length() - EARTH_RADIUS_M, 0)
  const op = altitudeToOpacity(altitude)
  if (op === opacityRef.current) return
  opacityRef.current = op
  // Walk the cloned GLB and update every material's opacity. Cheap — the
  // 1990s low-poly GLB has < 10 materials.
  if (groupRef.current) {
    groupRef.current.traverse((child) => {
      if (child.material) {
        child.material.transparent = true
        child.material.opacity = op
      }
    })
  }
  if (lineRef.current?.material) lineRef.current.material.opacity = op * 0.5
  if (pinRef.current?.material) pinRef.current.material.opacity = op * 0.9
})
```

Attach the refs to the JSX:

```jsx
<group ref={groupRef} position={position} quaternion={quaternion} scale={MARKER_SCALE}>
  <primitive object={cloned} />
</group>
{focalWorld && (
  <>
    <Line ref={lineRef} ... />
    <mesh ref={pinRef} position={focalWorld}>
      ...
    </mesh>
  </>
)}
```

- [ ] **Step 2: Visual verify**

Reload, save a view, then zoom OUT to high altitude (>5km). Markers should fade. Zoom back in (<1km altitude). Markers should reappear.

- [ ] **Step 3: Run unit tests**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/editor/scene/SavedViewMarkers.jsx
git commit -m "SavedViewMarkers: fade with camera altitude (1km → 5km)"
```

---

## Task 10: Click → restore-view + hover state

**Files:**
- Modify: `src/pages/editor/scene/SavedViewMarkers.jsx`

Goal: clicking a marker dispatches `restore-view`; hovering tracks which marker is under the cursor. Tooltip rendering comes in the next task.

- [ ] **Step 1: Lift hover state to the parent**

In `SavedViewMarkers` (the parent), add `useState` for `hoveredId`:

```jsx
import { useState } from 'react'

export default function SavedViewMarkers() {
  const on = useAtomValue(savedViewMarkersOnAtom)
  const views = useAtomValue(savedViewsAtom)
  const [hoveredId, setHoveredId] = useState(null)
  if (!on) return null
  if (!views?.length) return null
  return (
    <>
      {views.map((view) => (
        <SavedViewMarker
          key={view.id}
          view={view}
          isHovered={hoveredId === view.id}
          onHover={(hover) => setHoveredId(hover ? view.id : (h) => (h === view.id ? null : h))}
        />
      ))}
    </>
  )
}
```

(The `onHover` callback handles both enter (set the id) and leave (clear if it's still us — guards against stale fires).)

- [ ] **Step 2: Wire pointer events on the camera mesh**

In `SavedViewMarker`, accept `isHovered` and `onHover` props, and attach handlers to the camera-mesh group:

```jsx
function SavedViewMarker({ view, isHovered, onHover }) {
  // ...existing setup...

  const handleClick = (e) => {
    e.stopPropagation()
    if (opacityRef.current < 0.05) return // invisible — don't react
    window.dispatchEvent(new CustomEvent('restore-view', { detail: view }))
  }
  const handleOver = (e) => {
    e.stopPropagation()
    if (opacityRef.current < 0.05) return
    onHover(true)
    document.body.style.cursor = 'pointer'
  }
  const handleOut = (e) => {
    e.stopPropagation()
    onHover(false)
    document.body.style.cursor = ''
  }

  return (
    <>
      <group
        ref={groupRef}
        position={position}
        quaternion={quaternion}
        scale={MARKER_SCALE * (isHovered ? 1.15 : 1)}
        onClick={handleClick}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
      >
        <primitive object={cloned} />
      </group>
      {/* ...line + pin... */}
    </>
  )
}
```

(The `1.15×` scale on hover gives a subtle visual confirmation. The cursor switch makes it feel clickable.)

- [ ] **Step 3: Visual verify**

Reload, ensure 1+ saved views exist, Markers ON. Hover a marker — cursor turns into a pointer, marker subtly scales up. Click — camera flies to the saved view (the existing `restore-view` handler does the tween).

- [ ] **Step 4: Run unit tests**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/editor/scene/SavedViewMarkers.jsx
git commit -m "SavedViewMarkers: click dispatches restore-view, hover scales + cursor"
```

---

## Task 11: Hover tooltip overlay

**Files:**
- Modify: `src/pages/editor/scene/SavedViewMarkers.jsx`
- Create: `src/pages/editor/styles/saved-view-marker-tooltip.css`

Goal: when a marker is hovered, a DOM-overlay tooltip shows the view's name + thumbnail near the marker on screen.

- [ ] **Step 1: Create the stylesheet**

Create `src/pages/editor/styles/saved-view-marker-tooltip.css`:

```css
.svm-tooltip {
  position: fixed;
  z-index: 60;
  pointer-events: none;
  /* Dark warm-tinted glass card matching the editor aesthetic. */
  background: rgba(20, 15, 12, 0.95);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
          backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(230, 162, 74, 0.18);
  border-radius: 8px;
  padding: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
  /* Anchored to a transform we set per-frame from JS. */
  transform: translate3d(-9999px, -9999px, 0);
  will-change: transform;
}
.svm-tooltip__img {
  display: block;
  width: 200px;
  height: auto;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
}
.svm-tooltip__name {
  margin-top: 6px;
  color: rgba(255, 248, 236, 0.95);
  font: 500 13px Inter, system-ui, sans-serif;
  letter-spacing: 0.01em;
}
```

- [ ] **Step 2: Add the tooltip element + per-frame projection**

In `SavedViewMarkers.jsx`, add the imports + tooltip:

```jsx
import { createPortal } from 'react-dom'
import '../styles/saved-view-marker-tooltip.css'

// At the top of SavedViewMarkers parent component, add a ref for the
// tooltip DOM node + the hovered view object lookup:
const tooltipRef = useRef(null)
const hoveredView = useMemo(
  () => (hoveredId ? views.find((v) => v.id === hoveredId) : null),
  [hoveredId, views],
)
```

Add a separate per-frame updater component that lives inside the R3F scene but writes to the DOM:

```jsx
import { useFrame, useThree } from '@react-three/fiber'

function TooltipPositioner({ tooltipRef, hoveredView }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const projected = useRef(new Vector3())

  useFrame(() => {
    const el = tooltipRef.current
    if (!el || !hoveredView?.camera?.position) {
      if (el) el.style.transform = 'translate3d(-9999px, -9999px, 0)'
      return
    }
    const p = hoveredView.camera.position
    projected.current.set(p[0], p[1], p[2]).project(camera)
    // NDC → CSS pixels; offset by tooltip width so it floats to the right
    // of the marker, and 24px above so it doesn't sit on top of the mesh.
    const x = (projected.current.x * 0.5 + 0.5) * size.width
    const y = (-projected.current.y * 0.5 + 0.5) * size.height
    // Hide if the marker is behind the camera (z > 1) or off-screen.
    if (projected.current.z > 1 || x < -300 || x > size.width + 300) {
      el.style.transform = 'translate3d(-9999px, -9999px, 0)'
      return
    }
    el.style.transform = `translate3d(${Math.round(x + 16)}px, ${Math.round(y - 24)}px, 0)`
  })
  return null
}
```

Update `SavedViewMarkers` parent to render the tooltip via portal and the positioner:

```jsx
export default function SavedViewMarkers() {
  const on = useAtomValue(savedViewMarkersOnAtom)
  const views = useAtomValue(savedViewsAtom)
  const [hoveredId, setHoveredId] = useState(null)
  const tooltipRef = useRef(null)
  const hoveredView = useMemo(
    () => (hoveredId ? views.find((v) => v.id === hoveredId) : null),
    [hoveredId, views],
  )
  if (!on) return null
  if (!views?.length) return null
  return (
    <>
      {views.map((view) => (
        <SavedViewMarker
          key={view.id}
          view={view}
          isHovered={hoveredId === view.id}
          onHover={(hover) => setHoveredId(hover ? view.id : (h) => (h === view.id ? null : h))}
        />
      ))}
      <TooltipPositioner tooltipRef={tooltipRef} hoveredView={hoveredView} />
      {typeof document !== 'undefined' && createPortal(
        <div ref={tooltipRef} className="svm-tooltip" aria-hidden={!hoveredView}>
          {hoveredView?.thumbnail && (
            <img className="svm-tooltip__img" src={hoveredView.thumbnail} alt="" />
          )}
          <div className="svm-tooltip__name">{hoveredView?.name || 'View'}</div>
        </div>,
        document.body,
      )}
    </>
  )
}
```

- [ ] **Step 3: Visual verify**

Reload, hover a marker. Tooltip card with thumbnail + name should appear next to it. Move cursor to another marker — tooltip swaps. Move off — tooltip disappears (off-screen via the `-9999px` transform).

- [ ] **Step 4: Run unit tests**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 5: Smoke**

Run: `npm run smoke`
Expected: all checks PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/editor/scene/SavedViewMarkers.jsx src/pages/editor/styles/saved-view-marker-tooltip.css
git commit -m "SavedViewMarkers: hover tooltip with thumbnail + name"
```

---

## Task 12: Manual polish pass + ship

- [ ] **Step 1: Manual checklist**

With dev server running:
- Save a view at low altitude (~500m). Marker appears, camera mesh oriented correctly.
- Save a view tilted toward sky. Pin should fall to ellipsoid drop, not break the marker.
- Save 3+ views in a city. Toggle Markers off → none visible. Toggle on → all visible.
- Hover each marker → tooltip + thumbnail. Click → camera flies to that view, DoF/TOD/graphics restore.
- Zoom out to 5km+. Markers fade to invisible. Zoom in. Reappear.
- Reload page. Markers stay on if they were on, off if off (persistence).
- Open `/app-classic`. Verify markers also work there (same Scene component is shared).

- [ ] **Step 2: Run all tests one more time**

```bash
npx vitest run
npm run smoke
```

Expected: both clean.

- [ ] **Step 3: Push to main**

```bash
git push origin fix-mobile-render-invalidate
gh pr create --base main --head fix-mobile-render-invalidate \
  --title "Saved-view camera markers on the globe" \
  --body "Per docs/superpowers/specs/2026-04-30-saved-view-camera-markers-design.md and plan in docs/superpowers/plans/."
gh pr merge <PR#> --squash
```

(The PR # comes from the create command.)

- [ ] **Step 4: Verify on prod**

Wait for Vercel to register the new production deployment for the squashed commit. Hard-refresh `https://map-poster-app.vercel.app/app`. Save a view, toggle Markers ON. Confirm the GLB loads from `/camera-models/1990s_low_poly_camera.glb`.
