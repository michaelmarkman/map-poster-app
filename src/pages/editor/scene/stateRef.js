import { useEffect } from 'react'
import { useAtomValue } from 'jotai'
import {
  timeOfDayAtom,
  latitudeAtom,
  longitudeAtom,
  sunRotationAtom,
  bloomAtom,
  ssaoAtom,
  vignetteAtom,
  cloudsAtom,
  dofAtom,
  dofEngineAtom,
  IS_MOBILE,
} from '../atoms/scene'

// Mutable mirror of the scene atoms. The R3F useFrame runs at up to 60fps;
// React re-renders from atom changes only fire at UI frequency. Scene code
// reads from this ref inside useFrame so frame rate stays decoupled from
// React's render cycle.
export const sceneRef = {
  timeOfDay: 12,
  latitude: 40.748440,
  longitude: -73.985664,
  sunRotation: 0,
  bloom: { on: false },
  ssao: { on: false },
  vignette: { on: false },
  clouds: {
    on: true,
    coverage: IS_MOBILE ? 0.18 : 0.2,
    shadows: !IS_MOBILE,
    paused: false,
    speed: 1,
  },
  dof: {
    on: true,
    focalUV: [0.5, 0.5],
    tightness: 70,
    blur: 25,
    sceneColorPop: 0,
    focusColorPop: 60,
    // DoF-lab additions — default to "off / legacy" so /app behavior
    // is untouched. See docs/superpowers/specs/2026-04-21-dof-lab-design.md
    useApertureCoC: false,
    aperture: 4,            // f-stop; lab UI range f/1.4 – f/16
    highlightBokeh: true,   // weight bright samples in blur kernel as bokeh balls
    // World-space focal point cached on tap via Raycaster. Lib DoF engine
    // needs a world-distance focusDistance (meters), not a UV; we derive
    // that each frame as camera.position.distanceTo(focalWorld). Null
    // before first tap → lib engine falls back to a sensible default.
    focalWorld: null,       // THREE.Vector3 | null
  },
  // 'lib' = postprocessing's DepthOfFieldEffect, 'custom' = CustomDofEffect.
  // See atoms/scene.js comment. Mirrored here so useFrame can branch on it
  // without touching atoms on the hot path.
  dofEngine: 'lib',
  // Set by useGraphicEditor when the Fabric editor is on. Scene input
  // handlers (click-to-focus, WASD fly, scroll-wheel dolly) read this and
  // bail out so the editor owns pointer/keyboard input exclusively.
  editorActive: false,
}

// Subscribes to every scene atom via useAtomValue and copies the current
// value into sceneRef on every change. Mount once at the top of <Scene>.
export function useSceneRefSync() {
  const timeOfDay = useAtomValue(timeOfDayAtom)
  const latitude = useAtomValue(latitudeAtom)
  const longitude = useAtomValue(longitudeAtom)
  const sunRotation = useAtomValue(sunRotationAtom)
  const bloom = useAtomValue(bloomAtom)
  const ssao = useAtomValue(ssaoAtom)
  const vignette = useAtomValue(vignetteAtom)
  const clouds = useAtomValue(cloudsAtom)
  const dof = useAtomValue(dofAtom)
  const dofEngine = useAtomValue(dofEngineAtom)

  useEffect(() => { sceneRef.timeOfDay = timeOfDay }, [timeOfDay])
  useEffect(() => { sceneRef.latitude = latitude }, [latitude])
  useEffect(() => { sceneRef.longitude = longitude }, [longitude])
  useEffect(() => { sceneRef.sunRotation = sunRotation }, [sunRotation])
  useEffect(() => { sceneRef.bloom = bloom }, [bloom])
  useEffect(() => { sceneRef.ssao = ssao }, [ssao])
  useEffect(() => { sceneRef.vignette = vignette }, [vignette])
  useEffect(() => { sceneRef.clouds = clouds }, [clouds])
  useEffect(() => {
    // Merge instead of overwrite — focalWorld isn't in the atom, it's
    // pointer-driven CPU state that lives only here. A plain
    // `sceneRef.dof = dof` would blow it away on every dof atom update
    // (aperture slider, color-pop slider, etc.).
    sceneRef.dof = { ...dof, focalWorld: sceneRef.dof?.focalWorld ?? null }
  }, [dof])
  useEffect(() => { sceneRef.dofEngine = dofEngine }, [dofEngine])
}
