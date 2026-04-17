import React, { useMemo, forwardRef } from 'react'
import { Effect, EffectAttribute, BlendFunction } from 'postprocessing'
import { Uniform, Vector2 } from 'three'

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
const DOF_FRAG = /* glsl */`
#define getViewZ(d) perspectiveDepthToViewZ(d, cameraNear, cameraFar)
uniform vec2 focalPoint;
uniform float depthRange;
uniform float maxBlur;
uniform float sceneColorPop;
uniform float focusColorPop;

// Multi-ring disk sampler — concentric rings of samples for smooth bokeh
// 1 + 8 + 16 + 24 + 32 = 81 samples in a circular pattern
vec4 ringBlur(vec2 uv, float radius) {
  vec2 texelSize = 1.0 / vec2(textureSize(inputBuffer, 0));
  vec4 sum = texture(inputBuffer, uv);
  float tw = 1.0;

  // 4 rings with increasing sample count (8, 16, 24, 32)
  const int RING_COUNTS[4] = int[](8, 16, 24, 32);
  const float RING_RADII[4] = float[](0.25, 0.5, 0.75, 1.0);

  for (int r = 0; r < 4; r++) {
    int count = RING_COUNTS[r];
    float ringRadius = RING_RADII[r] * radius;
    float weight = 1.0 - RING_RADII[r] * 0.5; // outer rings weighted slightly less
    for (int i = 0; i < count; i++) {
      float angle = 6.2831853 * float(i) / float(count) + float(r) * 0.5;
      vec2 offset = vec2(cos(angle), sin(angle)) * ringRadius * texelSize;
      sum += texture(inputBuffer, uv + offset) * weight;
      tw += weight;
    }
  }
  return sum / tw;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float rawDepth = readDepth(uv);
  float focalRaw = readDepth(focalPoint);

  if (focalRaw >= 1.0) { outputColor = inputColor; return; }

  if (rawDepth >= 1.0) {
    outputColor = ringBlur(uv, maxBlur);
    return;
  }

  float viewZ = getViewZ(rawDepth);
  float focalZ = getViewZ(focalRaw);
  float relDiff = abs(viewZ - focalZ) / abs(focalZ);
  float coc = smoothstep(0.0, depthRange, relDiff) * maxBlur;

  vec4 color = inputColor;
  if (coc >= 0.5) {
    color = ringBlur(uv, coc);
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
    super('CustomDofEffect', DOF_FRAG, {
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
