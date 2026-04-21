# DoF Lab — aperture-based CoC + tilt-shift prototype

Date: 2026-04-21

## Goal

Prototype two DoF enhancements behind a copy of the `/app` pill editor so
they can be evaluated without touching production:

1. **Aperture-based CoC.** Replace the stylized
   `smoothstep(|viewZ-focalZ|/|focalZ|)` with a thin-lens
   approximation so the camera's focal length (mm) scrubber physically
   drives DoF depth. Three UI candidates (A/B/C) ship simultaneously
   behind a cycler chip so they can be compared A/B/C live.
2. **Explicit tilt-shift mode.** A depth-independent focal band
   (rotatable) that overrides the normal DoF path. The classic
   miniature-diorama look, with `Band width`, `Band position`, and
   `Rotation` controls.

`/app` must render identically after these changes — all new shader
behavior is gated on uniforms that default to "off / legacy".

## Architecture

**New route:** `/dof-lab` — full-screen, registered in `App.jsx` and
`vercel.json`. Lives in `src/pages/dof-lab/`, a direct copy of
`src/pages/mock/`. No component sharing between the two; they evolve
independently until a winner emerges.

**Shared scene, extended once:**
`src/pages/editor/scene/CustomDofEffect.jsx` and `Scene.jsx` gain new
uniforms and driving code **additively**. When the new flags are false
(the default), the shader runs exactly as today.

**State:** `dofAtom` in `src/pages/editor/atoms/scene.js` gains six
optional fields. `dofUiVariantAtom` (`'A' | 'B' | 'C'`) lives in
`src/pages/dof-lab/atoms.js`, persists to `localStorage` key
`dof_lab_ui_variant`. Never read by the scene — pure UI state.

## Shader — `CustomDofEffect.jsx`

### New uniforms

| Name              | Type   | Default    | Purpose                                    |
| ----------------- | ------ | ---------- | ------------------------------------------ |
| `useApertureCoC`  | bool   | `false`    | Switches CoC formula to thin-lens          |
| `apertureFactor`  | float  | `0.0625`   | `1 / f²` (f=4 default)                     |
| `focalLengthMm`   | float  | `35.0`     | Derived from `camera.fov` in Scene         |
| `tiltShiftMode`   | bool   | `false`    | Highest-priority mode; ignores depth        |
| `tiltCenter`      | vec2   | `(0.5,0.5)`| UV center of the sharp band                |
| `tiltBandHalf`    | float  | `0.1`      | Half-height of the sharp band (Y-UV units) |
| `tiltSoftness`    | float  | `0.05`     | Falloff outside the band (half of bandHalf)|
| `tiltRotation`    | float  | `0.0`      | Radians; 0 = horizontal                    |
| `canvasAspect`    | float  | `1.0`      | `width / height`; keeps band proportional  |

### Mode priority inside `mainImage`

```
if (tiltShiftMode)         → tilt-shift path (depth-independent)
else if (useApertureCoC)   → thin-lens CoC
else                       → existing smoothstep(relDiff) path   [today]
```

### Thin-lens CoC

```glsl
float vz = max(abs(viewZ),  1.0);
float fz = max(abs(focalZ), 1.0);
float coc = k * apertureFactor * focalLengthMm * focalLengthMm
          * abs(1.0 / fz - 1.0 / vz);
coc = clamp(coc, 0.0, maxBlur);
```

`k` is a calibration constant tuned so that f/4 at 50mm lands close to
today's visual blur at `blur=25%`.

### Tilt-shift path

```glsl
vec2 p = (uv - tiltCenter) * vec2(canvasAspect, 1.0);
float c = cos(tiltRotation);
float s = sin(tiltRotation);
float perp = abs(-s * p.x + c * p.y);
float t = smoothstep(tiltBandHalf, tiltBandHalf + tiltSoftness, perp);
float coc = t * maxBlur;
float focusAmount = 1.0 - t;   // so color pop still scopes correctly
```

The rest of the shader (sky-mix ramp, ring blur, color grade) runs
unchanged after the CoC is chosen.

## State extensions — `dofAtom`

```js
{
  on: true,
  focalUV: [0.5, 0.5],
  tightness: 70,
  blur: 25,
  sceneColorPop: 0,
  focusColorPop: 60,

  // NEW — all default to "off / legacy"
  useApertureCoC: false,
  aperture: 4,              // f-stop, UI slider range f/1.4 – f/16
  tiltShift: false,
  tiltCenter: [0.5, 0.5],
  tiltBandHalf: 0.1,
  tiltRotation: 0,
}
```

`stateRef.js` default matches. Persistence (localStorage) is
backward-compatible both ways — missing fields fall back to defaults.

### Scene.jsx — useFrame additions

```js
// mm from vertical fov (see CLAUDE.md gotcha #3 — fov is vertical)
const mm = 12 / Math.tan(camera.fov * Math.PI / 360)
const fStop = sceneRef.dof.aperture ?? 4
fx.uniforms.get('focalLengthMm').value = mm
fx.uniforms.get('apertureFactor').value = 1 / (fStop * fStop)
fx.uniforms.get('useApertureCoC').value = !!sceneRef.dof.useApertureCoC
fx.uniforms.get('tiltShiftMode').value   = !!sceneRef.dof.tiltShift
fx.uniforms.get('tiltCenter').value.set(...sceneRef.dof.tiltCenter)
fx.uniforms.get('tiltBandHalf').value    = sceneRef.dof.tiltBandHalf
fx.uniforms.get('tiltSoftness').value    = sceneRef.dof.tiltBandHalf * 0.5
fx.uniforms.get('tiltRotation').value    = sceneRef.dof.tiltRotation
fx.uniforms.get('canvasAspect').value    = size.width / size.height
```

## UI — three aperture variants (lab only)

The DoF popover in `/dof-lab` has a shared skeleton:

```
[on/off] DoF
  [toggle] Tilt-shift
  ─────────────────────
  {normal sliders OR tilt-shift sliders}
```

When `tiltShift=true`, the variant-specific sliders collapse and the
shared tilt-shift sliders appear.

### Variant A — Derive-only

Identical UI to today's `/app`. `useApertureCoC` turns on under the
hood; `aperture` is derived from the existing `Blur` slider (log-mapped
so 100% ≈ f/1.4, 0% ≈ f/16).

### Variant B — Aperture replaces Blur

```
Tightness  ──●──  70%
Pop        ●────  0%
Aperture   ──●──  f/4.0
```

Slider value shows `f/N`. Tightness still caps `maxBlur` via the
existing mapping — acts as a creative ceiling.

### Variant C — Camera-only

```
Aperture  ──●──  f/4.0
Pop       ●────  0%
```

`maxBlur` auto-derived from aperture. Falloff is purely physical.

### Shared tilt-shift layout

```
Band width     ──●──  10%
Band position  ──●──  50%
Rotation       ●────  0°   (slider range −90°..+90°)
Pop            ●────  0%
```

### Variant cycler chip

Bottom-right corner of the lab, always visible. One-tap cycles
`A → B → C → A`. Value persists to `localStorage`.

## Out-of-scope (for this prototype)

- Merging the winning variant back into `/app` — done in a follow-up
  once a winner is chosen.
- Highlight-aware bokeh, hexagonal blades, chromatic aberration,
  occlusion-aware gathering. (Listed in the original ideas response
  but parked for later.)
- Focus-pull animation on saved-view transitions.

## Success criteria

- `/app` and `/app-classic` render pixel-identically after the shader
  changes (smoke tests stay green).
- `/dof-lab` loads; DoF toggle, tilt-shift toggle, and all three
  variants cycle correctly; variant persists across reload.
- Dragging the mm scrubber visibly changes DoF depth in real time
  when `useApertureCoC` is on.
- Tilt-shift band rotates smoothly and stays proportional across
  canvas aspect ratios.
