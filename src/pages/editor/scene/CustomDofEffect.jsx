import React, { useMemo, forwardRef } from 'react'
import { Effect, EffectAttribute, BlendFunction } from 'postprocessing'
import { Uniform, Vector2 } from 'three'

// DoF-lab additions (see docs/superpowers/specs/2026-04-21-dof-lab-design.md).
// All new uniforms default to "off / legacy" — when useApertureCoC and
// tiltShiftMode are both false, the shader runs exactly as it did before
// these knobs were introduced, and /app renders identically.

// Mobile detection — matches atoms/scene.js. Used to pick a simpler/cheaper
// DoF variant. iPhone GPUs (and Android tier-1) have mediump-by-default
// precision on fragment shaders; running the full 81-sample ring blur
// against a mediump depth buffer produces a hard black band at the focal
// transition because samples go OOB at the frame edges (mobile GPUs return
// black on OOB texel fetches) and mediump depth loses precision, pushing
// some pixels past rawDepth >= 1.0 into the short-circuit full-blur path.
const IS_MOBILE_DEVICE = (() => {
  try {
    const narrow = window.matchMedia('(max-width: 1024px)').matches
    const coarse = window.matchMedia('(pointer: coarse)').matches
    return narrow && coarse
  } catch (e) { return false }
})()

// Custom depth-of-field shader — reads screen-center depth, blurs everything
// outside the focal plane, and applies a color-pop grade.
//
// Two independent pop amounts (see dofAtom docs for the UX reasoning):
//   sceneColorPop — saturation lift applied uniformly across the frame.
//                   Works regardless of whether DoF blur is active.
//   focusColorPop — extra boost scoped to the focal area via the same
//                   smoothstep mask the blur uses. Only meaningful when
//                   DoF is on; the UI disables the slider when it isn't.
// Final pop = clamp(sceneColorPop + focusAmount * focusColorPop, 0, 1).
//
// #MOBILE_DOF is spliced in at the top for mobile builds. It swaps to
// highp precision qualifiers on depth math, enables UV clamping, and
// picks a smaller sample ring (see buildFrag below).
const buildFrag = (mobile) => /* glsl */`
${mobile ? '#define MOBILE_DOF' : ''}
#define getViewZ(d) perspectiveDepthToViewZ(d, cameraNear, cameraFar)
uniform vec2 focalPoint;
uniform float depthRange;
uniform float maxBlur;
uniform float sceneColorPop;
uniform float focusColorPop;

// DoF-lab uniforms. Defaults produce legacy behavior.
uniform bool  useApertureCoC;    // false → smoothstep(relDiff) path
uniform float apertureFactor;    // = 1/N² (N = f-stop); bigger = more blur
uniform float focalLengthMm;     // derived from camera fov in Scene
uniform bool  tiltShiftMode;     // true overrides aperture and depth paths
uniform vec2  tiltCenter;        // UV center of sharp band
uniform float tiltBandHalf;      // half-height of sharp band, Y-UV units
uniform float tiltSoftness;      // falloff width outside the band
uniform float tiltRotation;      // radians; 0 = horizontal
uniform float canvasAspect;      // width / height; keeps band proportional

// Multi-ring disk sampler — concentric rings of samples for smooth bokeh.
// Desktop: 1 + 8 + 16 + 24 + 32 = 81 samples in 4 rings.
// Mobile : 1 + 6 + 12 + 18     = 37 samples in 3 rings (saves ~55%
//          fragment work; still smooth enough at moderate radii).
vec4 ringBlur(vec2 uv, float radius) {
  vec2 texelSize = 1.0 / vec2(textureSize(inputBuffer, 0));
  vec4 sum = texture(inputBuffer, uv);
  float tw = 1.0;

#ifdef MOBILE_DOF
  const int RING_COUNTS[3] = int[](6, 12, 18);
  const float RING_RADII[3] = float[](0.33, 0.66, 1.0);
  const int RINGS = 3;
#else
  const int RING_COUNTS[4] = int[](8, 16, 24, 32);
  const float RING_RADII[4] = float[](0.25, 0.5, 0.75, 1.0);
  const int RINGS = 4;
#endif

  for (int r = 0; r < RINGS; r++) {
    int count = RING_COUNTS[r];
    float ringRadius = RING_RADII[r] * radius;
    float weight = 1.0 - RING_RADII[r] * 0.5; // outer rings weighted slightly less
    for (int i = 0; i < count; i++) {
      float angle = 6.2831853 * float(i) / float(count) + float(r) * 0.5;
      vec2 offset = vec2(cos(angle), sin(angle)) * ringRadius * texelSize;
      // Clamp UV to [0,1]. Without this, samples off the frame edge return
      // black on many mobile GPUs regardless of the texture wrap mode,
      // which produces a dark band along the top/side edges wherever the
      // blur ring extends off-screen — the "black seam" bug. Desktop GPUs
      // clamp-to-edge implicitly, so this is a no-op there.
      vec2 sampleUv = clamp(uv + offset, vec2(0.0), vec2(1.0));
      sum += texture(inputBuffer, sampleUv) * weight;
      tw += weight;
    }
  }
  return sum / tw;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  // Force high precision on depth math. Mobile fragment shaders default
  // to mediump, which loses precision in perspectiveDepthToViewZ at the
  // globe's far distances (cameraFar ~ 1e7). The precision loss pushes
  // pixels either side of the focal plane into different discrete depth
  // buckets → visible banding. highp is cheap and fixes it.
  highp float rawDepth = readDepth(uv);
  highp float focalRaw = readDepth(focalPoint);

  // Short-circuit: if the user's focal point is on the sky (no geometry),
  // depth-based DoF has no meaningful focal distance so pass through.
  // Tilt-shift mode ignores the focal sample entirely, so skip this guard.
  if (!tiltShiftMode && focalRaw >= 1.0) { outputColor = inputColor; return; }

  // Soften the far-plane short-circuit into a very tight ramp. A hard
  // rawDepth>=1.0 branch created a black seam on mobile because mediump
  // depth quantization flipped neighbors across the 1.0 boundary.
  // The ramp MUST stay extremely narrow: perspective depth with
  // cameraFar=1e7 saturates close to 1.0 very fast — a pixel only 100m
  // away already has rawDepth > 0.99 on a globe scene. A wide ramp
  // (e.g. [0.99, 1.0]) sweeps the entire terrain into the sky-blur
  // branch, making the whole frame look blurry and defeating
  // tap-to-focus (sky branch ignores focalPoint). Keep the ramp to the
  // very last sliver so only true sky (rawDepth=1.0) and its immediate
  // precision-jitter neighbors trigger it.
  float skyMix = smoothstep(0.99999, 1.0, rawDepth);

  highp float viewZ = getViewZ(rawDepth);
  highp float focalZ = getViewZ(focalRaw);
  // Epsilon in the denominator so a focalZ that quantizes to 0 on
  // low-precision buffers doesn't produce Inf/NaN (which on some mobile
  // GPUs samples as black).
  highp float relDiff = abs(viewZ - focalZ) / max(abs(focalZ), 0.001);

  // CoC + focusAmount. Mode priority:
  //   tiltShiftMode  → depth-independent band (ignores focalPoint)
  //   useApertureCoC → thin-lens approximation (real camera feel)
  //   else           → legacy smoothstep(relDiff) path  [today's /app]
  float coc;
  float focusAmount;
  if (tiltShiftMode) {
    // Distance from the axis of the sharp band. Aspect-correct the UV
    // so the band's thickness is expressed in Y-units regardless of
    // canvas width.
    vec2 p = (uv - tiltCenter) * vec2(canvasAspect, 1.0);
    float cs = cos(tiltRotation);
    float sn = sin(tiltRotation);
    float perp = abs(-sn * p.x + cs * p.y);
    float t = smoothstep(tiltBandHalf, tiltBandHalf + tiltSoftness, perp);
    coc = t * maxBlur;
    focusAmount = 1.0 - t;
  } else if (useApertureCoC) {
    // Thin-lens CoC: ∝ (f²/N²) · |1/focalZ − 1/viewZ|.
    // The calibration constant 0.0008 was tuned so f/4 at 50mm produces
    // blur close to today's legacy feel at blur=25% — feel free to
    // adjust. Falloff width is still governed by maxBlur (the ceiling)
    // and the soft mix below.
    highp float vz = max(abs(viewZ), 1.0);
    highp float fz = max(abs(focalZ), 1.0);
    coc = 0.0008 * apertureFactor * focalLengthMm * focalLengthMm
        * abs(1.0 / fz - 1.0 / vz);
    coc = clamp(coc, 0.0, maxBlur);
    focusAmount = 1.0 - smoothstep(0.0, 1.5, coc);
  } else {
    coc = smoothstep(0.0, depthRange, relDiff) * maxBlur;
    // Keep the blur radius bounded — runaway CoC from depth precision
    // spikes would sample wildly across the frame, amplifying the OOB
    // darkening before the UV clamp catches it.
    coc = clamp(coc, 0.0, maxBlur);
    focusAmount = 1.0 - smoothstep(0.0, depthRange, relDiff);
  }

  vec4 color = inputColor;
  // Soft blend into the blurred result instead of a hard coc>=0.5
  // threshold. The hard cutoff created a visible step at the focal
  // boundary wherever mobile depth jitter pushed coc from 0.49 to 0.51
  // between adjacent pixels.
  if (coc > 0.0) {
    vec4 blurred = ringBlur(uv, coc);
    float mixAmt = smoothstep(0.0, 1.5, coc);
    color = mix(inputColor, blurred, mixAmt);
  }

  // Blend toward full sky-blur at the far plane ramp. Tilt-shift ignores
  // depth entirely, so don't double-dip here — the band already decides
  // what's sharp vs blurred.
  if (!tiltShiftMode && skyMix > 0.0) {
    vec4 skyBlur = ringBlur(uv, maxBlur);
    color = mix(color, skyBlur, skyMix);
  }

  // Color pop — scene baseline everywhere + focus boost on top of the
  // focal area. focusAmount was set above alongside coc so color pop
  // tracks the same focal region the blur uses (depth-based,
  // aperture-based, or tilt-shift band — whichever mode is active).
  float pop = min(1.0, sceneColorPop + focusAmount * focusColorPop);
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));

  // Saturation boost
  color.rgb = mix(vec3(luma), color.rgb, 1.0 + pop * 0.8);

  // Gentle contrast lift (protect shadows)
  float shadow = smoothstep(0.0, 0.3, luma);
  color.rgb = mix(color.rgb, mix(vec3(0.5), color.rgb, 1.0 + pop * 0.3), shadow);

  // Subtle warm shift
  color.r += pop * 0.015 * shadow;
  color.g += pop * 0.008 * shadow;

  // Desaturate blurred areas
  float blurAmt = 1.0 - focusAmount;
  color.rgb = mix(color.rgb, vec3(dot(color.rgb, vec3(0.299, 0.587, 0.114))), blurAmt * 0.12);

  outputColor = color;
}
`

export class CustomDofEffect extends Effect {
  constructor() {
    super('CustomDofEffect', buildFrag(IS_MOBILE_DEVICE), {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ['focalPoint', new Uniform(new Vector2(0.5, 0.5))],
        ['depthRange', new Uniform(1.5)],
        ['maxBlur', new Uniform(20)],
        ['sceneColorPop', new Uniform(0.0)],
        ['focusColorPop', new Uniform(0.6)],
        // DoF-lab — all default off/legacy so /app is unaffected.
        ['useApertureCoC', new Uniform(false)],
        ['apertureFactor', new Uniform(1 / 16)],   // f/4 default
        ['focalLengthMm', new Uniform(35)],
        ['tiltShiftMode', new Uniform(false)],
        ['tiltCenter', new Uniform(new Vector2(0.5, 0.5))],
        ['tiltBandHalf', new Uniform(0.1)],
        ['tiltSoftness', new Uniform(0.05)],
        ['tiltRotation', new Uniform(0)],
        ['canvasAspect', new Uniform(1)],
      ]),
    })
  }
}

// R3F wrapper — gives the post-processing pipeline a React component to mount.
// Parent uses the forwarded ref to reach .uniforms from Scene's useFrame.
export const CustomDof = forwardRef(function CustomDof(_, ref) {
  const effect = useMemo(() => new CustomDofEffect(), [])
  React.useImperativeHandle(ref, () => effect, [effect])
  return <primitive object={effect} dispose={null} />
})
