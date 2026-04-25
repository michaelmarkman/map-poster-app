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
// CoC without re-reading focalPoint. centerSigned is the signed view-
// space distance from focal plane (negative = nearer than focus, positive
// = farther) — used by occlusion-aware gather (#5).
//
// Hex bokeh (#3): real iris diaphragms have N blades (typically 6 on
// modern lenses). The aperture polygon shows up in OOF highlights as
// hexagonal bokeh balls instead of perfect circles. We approximate by
// snapping the per-sample radius to a hexagon — every angle gets shrunk
// toward the nearest hex apothem. Subtle but reads as "lens-character"
// rather than "post-effect."
const float HEX_BLADES = 6.0;
float hexShape(float angle) {
  // Apothem of a regular hexagon inscribed in a unit circle, rotated to
  // make the angle continuous. cos of distance to nearest blade vertex.
  float a = mod(angle, 6.2831853 / HEX_BLADES);
  return cos(a - 3.1415926 / HEX_BLADES) / cos(3.1415926 / HEX_BLADES);
}

vec4 ringBlur(vec2 uv, float radius, highp float focalZ, float centerSigned) {
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
    // Uniform-disc weight — the natural shape a circular aperture
    // produces. Each ring's per-sample weight is constant; the outer
    // rings naturally contribute more total energy because they have
    // more samples (8/16/24/32). Earlier inner-heavy / outer-heavy
    // mix was driven by bokehShape but produced visibly non-uniform
    // bokeh "halos" — a flat disc reads as cleaner lens character.
    // bokehShape still controls the mainImage sharp→blur transition
    // ramp, which is where it actually belongs.
    float baseWeight = 1.0;
    for (int i = 0; i < count; i++) {
      // Add the per-pixel jitter on top of the ring's evenly-spaced angles.
      // The old float(r) * 0.5 stagger between rings is kept — it's a
      // deterministic rotation that helps when dithering is disabled, and
      // does no harm when layered under the hash jitter.
      float angle = angleJitter + 6.2831853 * float(i) / float(count) + float(r) * 0.5;
      // Hex bokeh (#3): squish the sample radius by the hexagon apothem
      // factor at this angle. Effect: the OOF disc reads as a hexagon
      // (the shape of a 6-bladed iris), giving real-lens bokeh balls
      // instead of perfect circles. Apothem ratio is 0.866, so the
      // hexagon inscribes the circle — same max radius, six flat sides.
      float effRadius = ringRadius * hexShape(angle);
      vec2 offset = vec2(cos(angle), sin(angle)) * effRadius * texelSize;
      // Clamp UV to [0,1]. Without this, samples off the frame edge return
      // black on many mobile GPUs regardless of the texture wrap mode,
      // which produces a dark band along the top/side edges wherever the
      // blur ring extends off-screen — the "black seam" bug. Desktop GPUs
      // clamp-to-edge implicitly, so this is a no-op there.
      vec2 sampleUv = clamp(uv + offset, vec2(0.0), vec2(1.0));

      // Depth-aware weighting. Reconstruct the sample's own signed depth
      // and CoC. Signed lets us tell near-OOF (sample closer than focus)
      // from far-OOF (sample farther) — required for occlusion bleed.
      highp float sampleDepth = readDepth(sampleUv);
      highp float sampleViewZ = getViewZ(sampleDepth);
      highp float sampleSigned = sampleViewZ - focalZ;
      highp float sampleRelDiff = abs(sampleSigned) / max(abs(focalZ), 0.001);
      float sampleCoC = smoothstep(0.0, depthRange, sampleRelDiff) * maxBlur;
      // Standard depth weight: reject samples sharper than us so a
      // crisp subject doesn't bleed into the blurred backdrop around it.
      float baseDepthWeight = smoothstep(-1.0, 1.0, sampleCoC - centerCoC);
      // Occlusion bleed (#5): a near-OOF sample (foreground out-of-focus)
      // optically scatters its blur disc forward — its edge SHOULD spill
      // over an in-focus background. Enable that by accepting near-OOF
      // samples whenever their CoC reaches our pixel's distance from the
      // sample. Standard gather (above) doesn't do this; without it the
      // blurred foreground keeps a hard silhouette against sharp
      // background — the post-effect "tell." Sign convention: viewZ is
      // negative going into the screen, so sampleSigned < 0 means sample
      // is BEHIND focal (farther). centerSigned > 0 means our pixel is
      // in front (nearer). For a near-OOF sample to bleed, sample must
      // be further from camera than the focal (sampleSigned < 0)? No —
      // in three.js perspective view-Z, more-negative is farther. So
      // "nearer than focus" = sampleViewZ > focalZ = sampleSigned > 0.
      bool sampleNearer = sampleSigned > 0.0;
      float scatterReach = sampleNearer
        ? smoothstep(effRadius - 1.0, effRadius + 1.0, sampleCoC)
        : 0.0;
      float depthWeight = max(baseDepthWeight, scatterReach);
      // No floor — truly sharp far-side samples remain fully rejected.
      // tw is seeded at 1.0 by the center sample so we never divide by zero.

      // Highlight bokeh. Real lenses concentrate blurred-out bright
      // highlights into visible bokeh "balls" rather than washing them
      // out evenly. Boost bright samples in the kernel so the brightest
      // pixels dominate the disc.
      // CustomDof runs AFTER ToneMapping AGX in the composer chain, so
      // the input is in display-referred [0, 1] (not HDR). Threshold
      // (0.88, 1.0) picks up the brightest 12% of pixels — sun glints,
      // sunlit white roofs — without flooding diffuse whites like haze
      // or sky. Earlier threshold (1.0, 1.5) never fired because luma
      // can't exceed 1.0 in the post-AGX buffer.
      vec4 sampleColor = texture(inputBuffer, sampleUv);
      float sampleLuma = dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
      float highlightBoost = 1.0 + smoothstep(0.88, 1.0, sampleLuma) * highlightStrength;

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
  // Signed view-Z delta from focal plane. In three.js perspective view-Z,
  // values get more negative going into the screen, so signedDelta > 0
  // means the pixel is NEARER than focus, < 0 means FARTHER. Used by
  // both #2 (asymmetric near/far slab) and #5 (occlusion-aware gather).
  highp float signedDelta = viewZ - focalZ;
  // Epsilon in the denominator so a focalZ that quantizes to 0 on
  // low-precision buffers doesn't produce Inf/NaN.
  highp float relDiff = abs(signedDelta) / max(abs(focalZ), 0.001);

  // #2 Near/far DoF asymmetry. Real lenses have an in-focus zone that's
  // ~⅓ in front of the focal plane and ~⅔ behind — near OOF develops
  // faster per unit depth than far OOF. We achieve that by scaling the
  // relative-distance for the near side so it crosses the smoothstep
  // ramp twice as quickly. Same maxBlur on both sides (so a fully OOF
  // foreground and fully OOF background reach the same bokeh radius);
  // only the rate of leaving sharpness changes.
  float asymmetricRelDiff = signedDelta > 0.0 ? relDiff * 2.0 : relDiff;

  // CoC + focusAmount. depthRange is picked on the JS side (tightness
  // quadratic vs. aperture log curve in /dof-lab) — shader just consumes it.
  // Clamp the blur radius: runaway CoC from depth precision spikes would
  // sample wildly across the frame, amplifying OOB darkening before the
  // UV clamp catches it.
  float t = smoothstep(0.0, depthRange, asymmetricRelDiff);
  float coc = clamp(t * maxBlur, 0.0, maxBlur);
  float focusAmount = 1.0 - t;

  vec4 color = inputColor;
  // Soft blend into the blurred result. The mix curve endpoints widen
  // with bokehShape so wide apertures give a gradual, creamy sharp→blur
  // transition (endpoints 0.0→2.5) and narrow apertures keep the crisp,
  // quick transition (endpoints 0.1→1.0). This is subtle on a globe
  // scene but adds to the "lens character" feel.
  // #15 Skip ring blur entirely when CoC is sub-pixel — the blurred
  // result mixes back at near-zero anyway via mixAmt, so the 81 sample
  // taps are wasted fragment work for the in-focus zone (which is most
  // of the frame at moderate apertures). Saves a big chunk of the
  // shader's cost on every "in-focus" pixel.
  if (coc > 1.0) {
    vec4 blurred = ringBlur(uv, coc, focalZ, signedDelta);
    float mixLo = mix(0.1, 0.0, bokehShape);
    float mixHi = mix(1.0, 2.5, bokehShape);
    float mixAmt = smoothstep(mixLo, mixHi, coc);
    color = mix(inputColor, blurred, mixAmt);
  }

  // Blend toward full sky-blur at the far plane ramp.
  if (skyMix > 0.0) {
    vec4 skyBlur = ringBlur(uv, maxBlur, focalZ, signedDelta);
    color = mix(color, skyBlur, skyMix);
  }

  // #11 Chromatic aberration on CoC edges. Real lenses split RGB
  // wavelengths slightly at the focal-plane boundary — bright edges
  // pick up a faint cyan/red fringe. Approximate by sampling R and B
  // channels with a small UV offset proportional to coc, along the
  // local view direction (here just diagonal). Effect scales with
  // blur strength and disappears in-focus, so it reads as "lens
  // character" rather than "broken effect."
  if (coc > 0.5) {
    vec2 caTexel = 1.0 / vec2(textureSize(inputBuffer, 0));
    vec2 caOffset = vec2(1.0, 0.0) * coc * 0.15 * caTexel;
    float caR = texture(inputBuffer, clamp(uv + caOffset, vec2(0.0), vec2(1.0))).r;
    float caB = texture(inputBuffer, clamp(uv - caOffset, vec2(0.0), vec2(1.0))).b;
    // Blend the aberrated channels in proportional to coc — full at
    // the bokeh edge, none at the sharp center. Subtle: 30% mix max.
    float caAmt = smoothstep(0.5, 8.0, coc) * 0.3;
    color.r = mix(color.r, caR, caAmt);
    color.b = mix(color.b, caB, caAmt);
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
