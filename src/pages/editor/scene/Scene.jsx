import { useRef, useLayoutEffect, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector2, Vector3, Quaternion, Raycaster as RaycasterClass } from 'three'
import { EffectMaterial } from 'postprocessing'
import { GlobeControls } from '3d-tiles-renderer/r3f'
import { Atmosphere, AerialPerspective } from '@takram/three-atmosphere/r3f'
import { Clouds } from '@takram/three-clouds/r3f'
import { Geodetic, PointOfView, radians, Ellipsoid } from '@takram/three-geospatial'
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f'
import { useSetAtom, useAtomValue } from 'jotai'
import { cameraReadoutAtom } from '../atoms/ui'
import { registerCamera } from '../hooks/useSessionPersistence'
import {
  timeOfDayAtom,
  sunRotationAtom,
  dofAtom,
  cloudsAtom,
  bloomAtom,
  ssaoAtom,
  vignetteAtom,
  IS_MOBILE,
} from '../atoms/scene'

import Globe from './Globe'
import PostProcessing from './PostProcessing'
import { sceneRef, useSceneRefSync } from './stateRef'
import { EXPOSURE, _sunZenith } from '../utils/three'
import { clampCameraAltitude, syncCameraToUI } from '../utils/camera'
import { getDateFromHour } from '../utils/sun'

// Raycasts from the center of the screen to find what the camera is actually
// looking at (the subject), then converts the hit point to lat/lng. Used by
// Time Machine to research the subject rather than the camera's GPS position.
function SubjectListener() {
  const { camera, scene } = useThree()
  const raycaster = useRef(new RaycasterClass())
  const centerNDC = useRef(new Vector2(0, 0))

  useEffect(() => {
    const handler = (e) => {
      const resolve = e.detail?.resolve
      if (!resolve) return
      raycaster.current.setFromCamera(centerNDC.current, camera)
      const hits = raycaster.current.intersectObjects(scene.children, true)
      if (!hits.length) { resolve(null); return }
      try {
        const geo = new Geodetic().setFromECEF(hits[0].point)
        resolve({
          lat: geo.latitude * 180 / Math.PI,
          lng: geo.longitude * 180 / Math.PI,
        })
      } catch (err) {
        resolve(null)
      }
    }
    window.addEventListener('get-subject-coords', handler)
    return () => window.removeEventListener('get-subject-coords', handler)
  }, [camera, scene])

  return null
}

// Click-to-focus — tap anywhere on the canvas to update the DoF focal point.
// Writes to sceneRef.dof directly (per-frame reads pick it up on the next tick).
function ClickToFocus() {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const canvas = gl.domElement
    let downPos = null
    // On touch / coarse pointers a user's "tap" is rarely pixel-stable —
    // 12-14px is the accepted comfort zone for tap-vs-drag (MDN, Material).
    // Mouse pointers stay on the tight 8px threshold so precise clicks
    // still land where the user aimed.
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const tapThreshold = coarse ? 14 : 8
    const onDown = (e) => { downPos = { x: e.clientX, y: e.clientY } }
    const onUp = (e) => {
      if (!downPos || !sceneRef.dof.on) return
      if (sceneRef.editorActive || window.__editorActive) { downPos = null; return }
      const dx = e.clientX - downPos.x, dy = e.clientY - downPos.y
      downPos = null
      if (Math.sqrt(dx * dx + dy * dy) > tapThreshold) return
      const rect = canvas.getBoundingClientRect()
      sceneRef.dof.focalUV = [
        (e.clientX - rect.left) / rect.width,
        1.0 - (e.clientY - rect.top) / rect.height,
      ]
      // iOS Safari throttles the rAF loop on an idle WebGL canvas; without
      // a kick, a tap updates sceneRef but the shader uniforms don't land
      // until something else (camera move, slider) wakes the loop.
      invalidate()
    }
    // pointercancel fires on iOS Safari mid-gesture when another handler
    // grabs the pointer capture (e.g. GlobeControls promoting a tap into
    // an orbit). If we don't clear downPos, a subsequent non-tap move
    // would still resolve to focalUV update because downPos stayed set.
    const onCancel = () => { downPos = null }
    // Capture phase so our handler fires BEFORE 3d-tiles-renderer's
    // GlobeControls pointerdown callback (which calls preventDefault and
    // may capture the pointer for orbit). Without capture, the touch
    // sometimes got re-routed and our bubble-phase listener never ran on
    // iOS Safari → tap-to-focus was silently broken on phones.
    const opts = { capture: true }
    canvas.addEventListener('pointerdown', onDown, opts)
    canvas.addEventListener('pointerup', onUp, opts)
    canvas.addEventListener('pointercancel', onCancel, opts)
    return () => {
      canvas.removeEventListener('pointerdown', onDown, opts)
      canvas.removeEventListener('pointerup', onUp, opts)
      canvas.removeEventListener('pointercancel', onCancel, opts)
    }
  }, [gl, invalidate])
  return null
}

// Any change to a scene atom that affects the render should wake the R3F
// loop. frameloop="always" nominally runs every frame, but mobile browsers
// (iOS Safari most aggressively) throttle rAF on an idle WebGL canvas:
// drag a time-of-day slider on a phone and the state updates, the sceneRef
// sync runs, but the next frame can be hundreds of ms away — the UI feels
// dead. Subscribing to the relevant atoms here and calling invalidate() on
// each change forces a frame immediately, so the effect is visible the
// moment the atom changes. The per-frame reads inside useFrame still come
// from sceneRef; this hook only nudges the loop.
function useInvalidateOnSceneChange() {
  const invalidate = useThree((s) => s.invalidate)
  const timeOfDay = useAtomValue(timeOfDayAtom)
  const sunRotation = useAtomValue(sunRotationAtom)
  const dof = useAtomValue(dofAtom)
  const clouds = useAtomValue(cloudsAtom)
  const bloom = useAtomValue(bloomAtom)
  const ssao = useAtomValue(ssaoAtom)
  const vignette = useAtomValue(vignetteAtom)
  useEffect(() => {
    invalidate()
  }, [invalidate, timeOfDay, sunRotation, dof, clouds, bloom, ssao, vignette])
}

export default function Scene() {
  // Mirror atom values into sceneRef so per-frame reads don't pay React cost.
  useSceneRefSync()
  // Defensive: kick the render loop on every scene-atom change so mobile
  // Safari's rAF throttling can't strand a slider/time/DoF update off-screen.
  useInvalidateOnSceneChange()

  const camera = useThree(({ camera }) => camera)
  const composerRef = useRef(null)
  const atmosphereRef = useRef(null)
  const dofRef = useRef(null)
  const [, forceRender] = useState(0)
  const cloudsRef = useRef(null)
  const aerialRef = useRef(null)
  // Cache the AerialPerspective's original shadow object so we can restore
  // it when clouds.shadows toggles back on. Without this, the previous code
  // set `aerial.shadow = null` permanently and the next "Shadows ON" tried
  // to read uniforms off a null object → crash.
  const aerialShadowRef = useRef(null)

  // Initial camera — Empire State Building, NY. Target is aimed at the
  // building's mid-height (190m above base) so the shader DoF (which samples
  // depth at screen center = focalUV [0.5,0.5]) focuses on the building
  // rather than the ground. Distance is chosen so the eye altitude works
  // out to 700m:
  //   eye.alt - target.h = distance * sin(|pitch|) = distance * 0.5
  //   (700 - 190) = 510 = 1020 * 0.5  →  distance = 1020
  // takram's PointOfView uses (distance, heading, pitch): heading measured
  // from east so library heading 70° → UI heading 90°-70°=20° (NNE), pitch
  // -30° → UI tilt 60°.
  useLayoutEffect(() => {
    // Expose the camera to useSessionPersistence so it can serialize raw
    // ECEF position / quaternion / up on save, and rehydrate them on load.
    registerCamera(camera)

    // Try to restore from the saved session. Three levels of fallback:
    //   1. Full ECEF (position+quaternion+up) — exact restore
    //   2. Geodetic (latitude/longitude/altitude + tilt/heading) — rebuilds camera from stored lat/lng/altitude (older sessions)
    //   3. Empire State default
    // Validates every array element is finite so a corrupt session
    // (NaN crept in) doesn't silently break the camera forever.
    const isFiniteArray = (a, n) =>
      Array.isArray(a) && a.length === n && a.every((x) => Number.isFinite(x))
    try {
      const raw = localStorage.getItem('mapposter3d_poster_v2_session')
      if (raw) {
        const s = JSON.parse(raw)
        const c = s?.camera
        if (c && isFiniteArray(c.position, 3) && isFiniteArray(c.quaternion, 4) && isFiniteArray(c.up, 3)) {
          camera.position.set(c.position[0], c.position[1], c.position[2])
          camera.quaternion.set(c.quaternion[0], c.quaternion[1], c.quaternion[2], c.quaternion[3])
          camera.up.set(c.up[0], c.up[1], c.up[2])
          if (typeof c.fovMm === 'number' && Number.isFinite(c.fovMm)) {
            // three.js camera.fov is VERTICAL fov. Full-frame sensor height
            // is 24mm, so vfov = 2 * atan(12 / mm). Matches syncCameraToUI
            // and the FovListener — keeping this consistent avoids a bogus
            // dolly-zoom on restore.
            camera.fov = 2 * Math.atan(12 / c.fovMm) * 180 / Math.PI
            camera.updateProjectionMatrix()
          }
          if (typeof window !== 'undefined') window.__sessionRestore = 'ecef'
          return
        }
        // Older sessions may only have tilt/heading/altitude. Rebuild from
        // the saved scene lat/lng if they exist.
        const lat = s?.state?.latitude
        const lng = s?.state?.longitude
        const alt = typeof c?.altitude === 'number' ? c.altitude : 700
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const tilt = Number.isFinite(c?.tilt) ? c.tilt : 60
          const heading = Number.isFinite(c?.heading) ? c.heading : 20
          new PointOfView(1020, radians(90 - heading), radians(-(90 - tilt))).decompose(
            new Geodetic(radians(lng), radians(lat), alt).toECEF(),
            camera.position, camera.quaternion, camera.up,
          )
          if (typeof window !== 'undefined') window.__sessionRestore = 'geodetic'
          return
        }
      }
    } catch (e) {
      if (typeof window !== 'undefined') window.__sessionRestore = 'error:' + String(e?.message || e)
    }

    new PointOfView(1020, radians(70), radians(-30)).decompose(
      new Geodetic(radians(-73.985664), radians(40.748440), 190).toECEF(),
      camera.position, camera.quaternion, camera.up,
    )
    if (typeof window !== 'undefined') {
      const raw = (() => { try { return localStorage.getItem('mapposter3d_poster_v2_session') } catch { return null } })()
      window.__sessionRestore = raw ? 'fallback:session-present-but-incomplete' : 'fallback:no-session'
    }
  }, [camera])

  // Fly-to animation from location search. A ref holds the in-flight tween
  // so useFrame can step it; when done we clear the ref.
  const flyRef = useRef(null)
  useEffect(() => {
    const handler = (e) => {
      const { lat, lng } = e.detail
      const endPos = new Vector3()
      const endQuat = new Quaternion()
      const endUp = new Vector3()
      new PointOfView(500, radians(45), radians(-35)).decompose(
        new Geodetic(radians(lng), radians(lat)).toECEF(),
        endPos, endQuat, endUp,
      )
      flyRef.current = {
        startPos: camera.position.clone(),
        startQuat: camera.quaternion.clone(),
        startUp: camera.up.clone(),
        endPos, endQuat, endUp, progress: 0,
      }
    }
    window.addEventListener('fly-to', handler)
    return () => window.removeEventListener('fly-to', handler)
  }, [camera])

  // Camera-set from tilt/heading/altitude sliders.
  useEffect(() => {
    const handler = (e) => {
      const { tilt, heading, altitude } = e.detail
      const geo = new Geodetic().setFromECEF(camera.position)
      const newEye = new Geodetic(geo.longitude, geo.latitude, altitude).toECEF()
      const up = newEye.clone().normalize()
      const pole = new Vector3(0, 0, 1)
      const east = new Vector3().crossVectors(pole, up).normalize()
      const north = new Vector3().crossVectors(up, east).normalize()
      const hRad = radians(heading)
      const horizDir = new Vector3()
        .addScaledVector(north, Math.cos(hRad))
        .addScaledVector(east, Math.sin(hRad))
      const belowHorizon = radians(90 - tilt)
      const lookDir = new Vector3()
        .addScaledVector(horizDir, Math.cos(belowHorizon))
        .addScaledVector(up, -Math.sin(belowHorizon))
        .normalize()
      camera.position.copy(newEye)
      camera.up.copy(up)
      camera.lookAt(newEye.clone().add(lookDir.multiplyScalar(1000)))
    }
    window.addEventListener('camera-set', handler)
    return () => window.removeEventListener('camera-set', handler)
  }, [camera])

  // `fov-change` is handled by <FovListener> in scene/Controls.jsx, which
  // uses the vertical-sensor formula (2 * atan(12/mm)) AND runs a dolly
  // zoom so the subject stays the same size on screen. This Scene used to
  // have a second listener using the wrong horizontal-sensor formula,
  // which sent the camera to space on restore. Removed — Controls owns it.

  // Saved-view producer: hook dispatches 'get-camera' with a resolve callback
  // in detail; we fill it with the current camera state.
  useEffect(() => {
    const handler = (e) => {
      const resolve = e.detail?.resolve
      if (typeof resolve !== 'function') return
      const geo = (() => {
        try { return new Geodetic().setFromECEF(camera.position) } catch { return null }
      })()
      const fovMm = Math.max(14, Math.min(200, Math.round(12 / Math.tan(camera.fov * Math.PI / 360))))
      resolve({
        position: [camera.position.x, camera.position.y, camera.position.z],
        quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
        up: [camera.up.x, camera.up.y, camera.up.z],
        latitude: geo ? geo.latitude * 180 / Math.PI : null,
        longitude: geo ? geo.longitude * 180 / Math.PI : null,
        altitude: geo ? Math.max(0, geo.height) : null,
        fovMm,
      })
    }
    window.addEventListener('get-camera', handler)
    return () => window.removeEventListener('get-camera', handler)
  }, [camera])

  // Saved-view consumer: restore-view applies a saved payload directly to
  // the camera. Accepts either the bare camera object {position, quaternion,
  // up, ...} OR a wrapped saved-view {camera: {...}, tod, ...}. Geodetic
  // {latitude, longitude, altitude} is the last-resort fallback.
  useEffect(() => {
    const handler = (e) => {
      const detail = e.detail
      if (!detail) return
      const v = detail.camera && typeof detail.camera === 'object' ? detail.camera : detail
      if (Array.isArray(v.position) && v.position.length === 3) {
        camera.position.set(v.position[0], v.position[1], v.position[2])
      } else if (v.latitude != null && v.longitude != null && v.altitude != null) {
        const p = new Geodetic(radians(v.longitude), radians(v.latitude), v.altitude).toECEF()
        camera.position.copy(p)
      }
      if (Array.isArray(v.quaternion) && v.quaternion.length === 4) {
        camera.quaternion.set(v.quaternion[0], v.quaternion[1], v.quaternion[2], v.quaternion[3])
      }
      if (Array.isArray(v.up) && v.up.length === 3) {
        camera.up.set(v.up[0], v.up[1], v.up[2])
      }
      if (v.fovMm != null) {
        // Vertical fov from 24mm-full-frame-sensor-height formula (see
        // useLayoutEffect above). Must match syncCameraToUI / FovListener.
        camera.fov = 2 * Math.atan(12 / v.fovMm) * 180 / Math.PI
        camera.updateProjectionMatrix()
      }
    }
    window.addEventListener('restore-view', handler)
    return () => window.removeEventListener('restore-view', handler)
  }, [camera])

  // Re-render when effects are toggled (backward compat — atoms drive the
  // sceneRef sync already, this just lets conditional mounts re-evaluate).
  useEffect(() => {
    const handler = () => forceRender(n => n + 1)
    window.addEventListener('effects-changed', handler)
    return () => window.removeEventListener('effects-changed', handler)
  }, [])

  // Expose the live camera readout (tilt/heading/altitude) so the Camera
  // sidebar section can display current values without polling the DOM.
  const setCameraReadout = useSetAtom(cameraReadoutAtom)

  useFrame(({ gl }, delta) => {
    // Step fly-to tween (smoothstep ease, 2s duration).
    const fly = flyRef.current
    if (fly && fly.progress < 1) {
      fly.progress = Math.min(1, fly.progress + delta / 2)
      const t = fly.progress
      const s = t * t * (3 - 2 * t)
      camera.position.lerpVectors(fly.startPos, fly.endPos, s)
      camera.quaternion.slerpQuaternions(fly.startQuat, fly.endQuat, s)
      camera.up.lerpVectors(fly.startUp, fly.endUp, s)
      if (fly.progress >= 1) flyRef.current = null
    }

    gl.toneMappingExposure = EXPOSURE

    // Update longitude/latitude from current camera position so sun tracks
    // the place you're flying over. Written back into sceneRef — the atom
    // sync runs the other way only (atom → ref), so we skip the atom write
    // here. (Phase 3 will add an atom setter so the sidebar can read these.)
    try {
      const geo = new Geodetic().setFromECEF(camera.position)
      sceneRef.longitude = geo.longitude * 180 / Math.PI
      sceneRef.latitude = geo.latitude * 180 / Math.PI
    } catch (e) {}

    // Update atmosphere from time slider
    const date = getDateFromHour(sceneRef.timeOfDay, sceneRef.longitude)
    atmosphereRef.current?.updateByDate(date)

    // Stylistic sun rotation — rotate the sun's direction around the local
    // zenith (surface normal at the camera's current position). This shifts
    // where the sun rises and sets in the sky without changing its elevation
    // arc.
    if (atmosphereRef.current?.sunDirection && sceneRef.sunRotation !== 0) {
      const zenith = _sunZenith.copy(camera.position).normalize()
      Ellipsoid.WGS84.getSurfaceNormal(camera.position, zenith)
      atmosphereRef.current.sunDirection.applyAxisAngle(zenith, sceneRef.sunRotation * Math.PI / 180)
    }

    // Update clouds
    const clouds = cloudsRef.current
    window._cloudsRef = clouds
    if (clouds) {
      clouds.coverage = sceneRef.clouds.on ? sceneRef.clouds.coverage : 0
      const spd = sceneRef.clouds.paused ? 0 : sceneRef.clouds.speed * 0.001
      clouds.localWeatherVelocity.set(spd, 0)
    }
    // Toggle cloud shadows on aerial perspective. Cache the live shadow
    // object on first frame so we can restore it when the user flips
    // shadows back on (otherwise nulling it permanently breaks the toggle).
    const aerial = aerialRef.current
    if (aerial) {
      if (aerial.shadow && !aerialShadowRef.current) {
        aerialShadowRef.current = aerial.shadow
      }
      aerial.shadow = sceneRef.clouds.shadows ? (aerialShadowRef.current || aerial.shadow) : null
    }

    // Update DoF uniforms
    const fx = dofRef.current
    if (fx && fx.uniforms) {
      // Color pop — two independent amounts:
      //   sceneColorPop applies everywhere, regardless of DoF.
      //   focusColorPop applies on top within the focal area — only
      //     meaningful when DoF is on (no focal plane otherwise).
      // The shader clamps sceneColorPop + focusAmount*focusColorPop to 1.
      fx.uniforms.get('sceneColorPop').value = (sceneRef.dof.sceneColorPop ?? 0) / 100
      if (!sceneRef.dof.on) {
        fx.uniforms.get('focusColorPop').value = 0
        fx.uniforms.get('maxBlur').value = 0
      } else {
        fx.uniforms.get('focusColorPop').value = (sceneRef.dof.focusColorPop ?? 0) / 100
        fx.uniforms.get('focalPoint').value.set(sceneRef.dof.focalUV[0], sceneRef.dof.focalUV[1])
        const t = sceneRef.dof.tightness / 100
        fx.uniforms.get('depthRange').value = 3.0 * (1.0 - t) * (1.0 - t) + 0.005
        fx.uniforms.get('maxBlur').value = 2 + (sceneRef.dof.blur / 100) * 48
      }
    }

    // Sync camera near/far into effects
    const composer = composerRef.current
    if (composer) {
      composer.passes.forEach(pass => {
        if (pass.fullscreenMaterial instanceof EffectMaterial) {
          pass.fullscreenMaterial.adoptCameraSettings(camera)
        }
      })
    }

    // Soft ground clamp: if the camera slips below the sea-level ellipsoid
    // (happens when a user flies through terrain in a valley or right down
    // through the ground), pull it back up along the local surface normal.
    // Uses lerp rather than a hard set so it feels like bouncing off the
    // ground, not a brick wall. Kept cheap — just one Geodetic per frame.
    clampCameraAltitude(camera)

    // Sync live camera geometry → UI atom (5Hz).
    syncCameraToUI(camera, setCameraReadout)
  })

  return (
    <Atmosphere ref={atmosphereRef} correctAltitude>
      <Globe>
        <GlobeControls enableDamping adjustHeight={false} maxAltitude={Math.PI * 0.55} />
      </Globe>
      <ClickToFocus />
      <SubjectListener />

      <PostProcessing composerRef={composerRef} dofRef={dofRef}>
        <Clouds
          ref={cloudsRef}
          coverage={sceneRef.clouds.coverage}
          qualityPreset="high"
          shadow-farScale={0.25}
          localWeatherVelocity={[0.001, 0]}
        />
        <AerialPerspective ref={aerialRef} sky sunLight skyLight correctGeometricError albedoScale={2 / Math.PI} />
        {!IS_MOBILE && <LensFlare />}
        <Dithering />
      </PostProcessing>
    </Atmosphere>
  )
}
