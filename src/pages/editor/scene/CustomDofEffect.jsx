import React, { useMemo, forwardRef } from 'react'
import { Effect, EffectAttribute, BlendFunction } from 'postprocessing'
import { Uniform, Vector2 } from 'three'

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

  if (focalRaw >= 1.0) { outputColor = inputColor; return; }

  // Soften the far-plane short-circuit into a ramp between the generic
  // CoC path and full-blur. A hard rawDepth>=1.0 branch created
  // a visible black seam on mobile because mediump depth quantization
  // caused neighboring pixels to straddle the 1.0 boundary — one pixel
  // full-blurred, the next barely blurred, repeat. skyMix ramps smoothly
  // over the last 1% of depth range.
  float skyMix = smoothstep(0.99, 1.0, rawDepth);

  highp float viewZ = getViewZ(rawDepth);
  highp float focalZ = getViewZ(focalRaw);
  // Epsilon in the denominator so a focalZ that quantizes to 0 on
  // low-precision buffers doesn't produce Inf/NaN (which on some mobile
  // GPUs samples as black).
  highp float relDiff = abs(viewZ - focalZ) / max(abs(focalZ), 0.001);
  float coc = smoothstep(0.0, depthRange, relDiff) * maxBlur;
  // Keep the blur radius bounded — runaway CoC from depth precision
  // spikes would sample wildly across the frame, amplifying the OOB
  // darkening before the UV clamp catches it.
  coc = clamp(coc, 0.0, maxBlur);

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

  // Blend toward full sky-blur at the far plane ramp.
  if (skyMix > 0.0) {
    vec4 skyBlur = ringBlur(uv, maxBlur);
    color = mix(color, skyBlur, skyMix);
  }

  // Color pop — scene baseline everywhere + focus boost on top of the
  // focal area. Clamped so two maxed sliders can't exceed the shader's
  // natural "fully popped" range.
  float focusAmount = 1.0 - smoothstep(0.0, depthRange, relDiff);
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
