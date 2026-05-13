import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BackSide, ShaderMaterial, SphereGeometry, Quaternion, Vector3 } from 'three'
import { sceneRef } from './stateRef'

// Mobile sky fallback — replaces the takram volumetric Atmosphere on
// devices where its raymarching cost (and shadow / aerial perspective
// shaders) push the GPU past the thermal/watchdog budget. Renders a
// large back-side sphere with a vertical gradient that shifts hue
// across the time-of-day cycle. Deliberately cheap: no raymarching,
// ~10 lines of GLSL, ~30 fragments per pixel max (mostly trivial mix
// calls).

// Sphere radius: large enough to surround everything inside the frustum
// near plane on a globe scene (cameraNear is ~1, cameraFar ~1e7 inside
// the editor), small enough that depth precision stays usable. 50,000m
// puts the dome ~50km out — well clear of any visible terrain detail,
// inside cameraFar.
const SKY_RADIUS = 50000

const SKY_VS = /* glsl */`
varying vec3 vLocalDir;
void main() {
  // position is in local sphere space; normalized = direction from
  // sphere center. Local +Y is "up" because we orient the mesh to
  // align with camera.up each frame.
  vLocalDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// Three color stops per time-of-day mode (zenith / mid / horizon),
// blended by smoothstep on the Y component of the view direction.
// Time mode selection happens inside the shader so we get smooth
// crossfades at dusk/dawn boundaries instead of a hard switch.
const SKY_FS = /* glsl */`
varying vec3 vLocalDir;
uniform float uTime;          // hour of day, 0..24

vec3 mixSky(vec3 horizon, vec3 mid, vec3 zenith, float y) {
  // y range: -1 (down) to 1 (up). Most of the visible gradient lives
  // in the upper hemisphere (y >= 0); below the horizon we fade to
  // a slightly darker version of horizon so the seam is invisible.
  float midBand = smoothstep(0.0, 0.45, y);
  float topBand = smoothstep(0.45, 1.0, y);
  vec3 c = mix(horizon, mid, midBand);
  c = mix(c, zenith, topBand);
  // Slight darkening below the horizon (the user normally won't see
  // it on a globe — the terrain covers most of the lower hemisphere
  // — but it prevents a hard edge if they tilt up).
  float belowMix = smoothstep(0.0, -0.4, y);
  c = mix(c, horizon * 0.65, belowMix);
  return c;
}

void main() {
  float y = vLocalDir.y;

  // Crossfade weights: night, dawn, day, dusk. Sum to 1.0 inside the
  // shader (deliberately wider band centers than the boundary list
  // in the task spec so transitions are soft, not stepped).
  float h = uTime;
  // Treat 0..5 and 19..24 as night, with smooth crossover into 5..7 / 17..19.
  float wDawn = smoothstep(4.5, 6.0, h) * (1.0 - smoothstep(7.0, 8.5, h));
  float wDay  = smoothstep(7.0, 8.5, h) * (1.0 - smoothstep(16.0, 17.5, h));
  float wDusk = smoothstep(16.0, 17.5, h) * (1.0 - smoothstep(19.0, 20.5, h));
  float wNight = clamp(1.0 - (wDawn + wDay + wDusk), 0.0, 1.0);

  // Night: dark navy → deep blue → dark purple horizon.
  vec3 nightZ = vec3(0.012, 0.020, 0.055);
  vec3 nightM = vec3(0.045, 0.055, 0.115);
  vec3 nightH = vec3(0.090, 0.060, 0.115);

  // Dawn/dusk: dark blue → warm orange → pink horizon. Slight asymmetry
  // (dawn cooler, dusk warmer) is handled by blending the two phases;
  // the colors below are the shared "golden" core.
  vec3 duskZ = vec3(0.08, 0.10, 0.22);
  vec3 duskM = vec3(0.62, 0.42, 0.30);
  vec3 duskH = vec3(0.95, 0.55, 0.45);

  // Day: deep blue → sky blue → warm white horizon.
  vec3 dayZ = vec3(0.22, 0.46, 0.72);
  vec3 dayM = vec3(0.58, 0.78, 0.95);
  vec3 dayH = vec3(0.96, 0.92, 0.88);

  vec3 cNight = mixSky(nightH, nightM, nightZ, y);
  vec3 cDawn  = mixSky(duskH,  duskM,  duskZ,  y);
  vec3 cDay   = mixSky(dayH,   dayM,   dayZ,   y);
  vec3 cDusk  = mixSky(duskH,  duskM,  duskZ,  y);

  vec3 final = cNight * wNight + cDawn * wDawn + cDay * wDay + cDusk * wDusk;

  // EXPOSURE=10 is applied via the renderer toneMappingExposure → AGX
  // composer pass. AGX expects scene-referred linear input; our colors
  // above are picked in the display-referred range, so divide by the
  // exposure to land at a sensible brightness after tone mapping.
  // (Without this the sky reads as full-saturation white in the final
  // composite.)
  final /= 10.0;

  gl_FragColor = vec4(final, 1.0);
}
`

const _up = new Vector3()
const _quat = new Quaternion()
const _defaultUp = new Vector3(0, 1, 0)

export default function MobileSky() {
  const meshRef = useRef(null)
  const matRef = useRef(null)
  const camera = useThree((s) => s.camera)

  const geometry = useMemo(() => new SphereGeometry(SKY_RADIUS, 32, 16), [])
  const material = useMemo(() => {
    const m = new ShaderMaterial({
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      uniforms: { uTime: { value: 12 } },
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    })
    matRef.current = m
    return m
  }, [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    // Anchor at camera so the dome is always around the viewer.
    mesh.position.copy(camera.position)
    // Orient so the mesh's local +Y points along the camera.up vector.
    // On a globe this is the surface normal at the camera's current
    // position, so "up" in shader-space matches the geographic horizon.
    _up.copy(camera.up).normalize()
    _quat.setFromUnitVectors(_defaultUp, _up)
    mesh.quaternion.copy(_quat)
    // Time of day from the live sceneRef (already kept in sync at React
    // pace by useSceneRefSync). Cheap uniform write, no recompile.
    if (matRef.current) matRef.current.uniforms.uTime.value = sceneRef.timeOfDay
  })

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-1000}
    />
  )
}
