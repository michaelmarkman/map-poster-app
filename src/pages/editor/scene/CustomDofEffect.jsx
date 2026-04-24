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

// DoF-lab Phase 2: bokeh character. 0 = narrow/crisp (inner-heavy rings,
// fast sharp→blurred transition). 1 = wide/creamy (outer-heavy rings,
// soft gradual transition). Aperture slider in /dof-lab writes this.
uniform float bokehShape;

// Highlight-bokeh strength multiplier. 0 = uniform blur (bright samples
// get no special treatment). 4 = strong lens-like bokeh balls — bright
// highlights dominate the blur kernel. Scene.jsx writes this from the
// dof.highlightBokeh toggle (on → 4, off → 0).
uniform float highlightStrength;


// Multi-ring disk sampler — concentric rings of samples for smooth bokeh.
// Desktop: 1 + 8 + 16 + 24 + 32 = 81 samples in 4 rings.
// Mobile : 1 + 6 + 12 + 18     = 37 samples in 3 rings (saves ~55%
//          fragment work; still smooth enough at moderate radii).
// Cheap per-pixel hash for angle dithering. One call per fragment, reused
// across all rings — breaks up the visible ring structure at high blur
// radii (otherwise you can see faint concentric bands from the fixed
// sample angles). Different pixels get different rotations so the banding
// decorrelates between neighbors.
float dofHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// radius IS the center pixel's CoC (both derived from the same calc in
// mainImage). focalZ is passed so each sample can reconstruct its own
// CoC without re-reading focalPoint.
vec4 ringBlur(vec2 uv, float radius, highp float focalZ) {
  vec2 texelSize = 1.0 / vec2(textureSize(inputBuffer, 0));
  vec4 sum = texture(inputBuffer, uv);
  float tw = 1.0;
  float centerCoC = radius;
  // One random rotation per pixel, applied to every ring. 2π range.
  float angleJitter = dofHash(uv) * 6.2831853;

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
    // Narrow aperture (bokehShape=0): inner-heavy weights → tighter,
    // more defined blur (closer to Gaussian). Wide aperture
    // (bokehShape=1): outer-heavy weights → hollow-disc feel, creamier,
    // bokeh-ball-like. Mix between the two curves as aperture opens.
    float innerHeavy = 1.0 - RING_RADII[r] * 0.5;    // 1.0 center → 0.5 outer
    float outerHeavy = 0.5 + RING_RADII[r] * 0.5;    // 0.5 center → 1.0 outer
    float baseWeight = mix(innerHeavy, outerHeavy, bokehShape);
    for (int i = 0; i < count; i++) {
      // Add the per-pixel jitter on top of the ring's evenly-spaced angles.
      // The old float(r) * 0.5 stagger between rings is kept — it's a
      // deterministic rotation that helps when dithering is disabled, and
      // does no harm when layered under the hash jitter.
      float angle = angleJitter + 6.2831853 * float(i) / float(count) + float(r) * 0.5;
      vec2 offset = vec2(cos(angle), sin(angle)) * ringRadius * texelSize;
      // Clamp UV to [0,1]. Without this, samples off the frame edge return
      // black on many mobile GPUs regardless of the texture wrap mode,
      // which produces a dark band along the top/side edges wherever the
      // blur ring extends off-screen — the "black seam" bug. Desktop GPUs
      // clamp-to-edge implicitly, so this is a no-op there.
      vec2 sampleUv = clamp(uv + offset, vec2(0.0), vec2(1.0));

      // Depth-aware weighting. Reconstruct the sample's own CoC from its
      // depth. If the sample is SHARPER than the center pixel (i.e.
      // it's a foreground object closer to the focal plane), reject it
      // so its color doesn't bleed into our blurred result — the main
      // cause of the halo/ghost-glow artifact around sharp subjects on
      // blurred backgrounds. Smoothstep rather than hard step so the
      // depth check itself doesn't introduce new ring artifacts.
      highp float sampleDepth = readDepth(sampleUv);
      highp float sampleViewZ = getViewZ(sampleDepth);
      highp float sampleRelDiff = abs(sampleViewZ - focalZ) / max(abs(focalZ), 0.001);
      float sampleCoC = smoothstep(0.0, depthRange, sampleRelDiff) * maxBlur;
      // 1.0 when sample is at or above our CoC; ramps down when sharper.
      // Tolerance of ~1 CoC-unit gives a soft edge around the focal boundary.
      float depthWeight = smoothstep(-1.0, 1.0, sampleCoC - centerCoC);
      // Small floor so a ring that happens to be entirely in-focus doesn't
      // leave us dividing by near-zero (rare but creates a visible speckle).
      depthWeight = max(depthWeight, 0.05);

      // Highlight bokeh. Real lenses concentrate blurred-out bright
      // highlights (sun glints on water, snow caps, specular rim lights)
      // into visible bokeh "balls" rather than washing them out evenly
      // across the blur kernel. We fake that by giving bright samples
      // much more weight than dim ones — same total energy in the ring,
      // just redistributed so the brightest pixels dominate.
      // Narrow luma band: only truly hot pixels (post-bloom > 1.0)
      // trigger. Earlier (0.85, 1.2) picked up diffuse brights like
      // clouds and snow, turning the whole sky into cotton-ball bokeh
      // at high blur radii. Real specular highlights (sun glints on
      // water, sunlit metal edges) blow past 1.0 from bloom and still
      // trigger cleanly.
      vec4 sampleColor = texture(inputBuffer, sampleUv);
      float sampleLuma = dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
      float highlightBoost = 1.0 + smoothstep(1.0, 1.5, sampleLuma) * highlightStrength;

      float weight = baseWeight * depthWeight * highlightBoost;
      sum += sampleColor * weight;
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
  if (focalRaw >= 1.0) { outputColor = inputColor; return; }

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

  // CoC + focusAmount. depthRange is picked on the JS side (tightness
  // quadratic vs. aperture log curve in /dof-lab) — shader just consumes it.
  // Clamp the blur radius: runaway CoC from depth precision spikes would
  // sample wildly across the frame, amplifying OOB darkening before the
  // UV clamp catches it.
  float t = smoothstep(0.0, depthRange, relDiff);
  float coc = clamp(t * maxBlur, 0.0, maxBlur);
  float focusAmount = 1.0 - t;

  vec4 color = inputColor;
  // Soft blend into the blurred result. The mix curve endpoints widen
  // with bokehShape so wide apertures give a gradual, creamy sharp→blur
  // transition (endpoints 0.0→2.5) and narrow apertures keep the crisp,
  // quick transition (endpoints 0.1→1.0). This is subtle on a globe
  // scene but adds to the "lens character" feel.
  if (coc > 0.0) {
    vec4 blurred = ringBlur(uv, coc, focalZ);
    float mixLo = mix(0.1, 0.0, bokehShape);
    float mixHi = mix(1.0, 2.5, bokehShape);
    float mixAmt = smoothstep(mixLo, mixHi, coc);
    color = mix(inputColor, blurred, mixAmt);
  }

  // Blend toward full sky-blur at the far plane ramp.
  if (skyMix > 0.0) {
    vec4 skyBlur = ringBlur(uv, maxBlur, focalZ);
    color = mix(color, skyBlur, skyMix);
  }

  // Color pop — scene baseline everywhere + focus boost on top of the
  // focal area. focusAmount was set above alongside coc so color pop
  // tracks the same focal region the blur uses.
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
        // DoF-lab Phase 2 — 0 = narrow/crisp (legacy feel), 1 = wide/creamy.
        ['bokehShape', new Uniform(0)],
        // Highlight bokeh strength. Default 4 matches the original
        // hardcoded value; /dof-lab toggle can set it to 0.
        ['highlightStrength', new Uniform(4)],
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
