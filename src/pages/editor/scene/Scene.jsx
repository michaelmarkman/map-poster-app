import { useRef, useLayoutEffect, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector2, Vector3, Quaternion, Raycaster as RaycasterClass } from 'three'
import { EffectMaterial } from 'postprocessing'
import { GlobeControls } from '3d-tiles-renderer/r3f'
import { Atmosphere, AerialPerspective } from '@takram/three-atmosphere/r3f'
import { Clouds } from '@takram/three-clouds/r3f'
import { Geodetic, PointOfView, radians, Ellipsoid } from '@takram/three-geospatial'
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f'
import { useSetAtom } from 'jotai'
import { cameraReadoutAtom } from '../atoms/ui'
import { registerCamera } from '../hooks/useSessionPersistence'

import Globe from './Globe'
import PostProcessing from './PostProcessing'
import { sceneRef, useSceneRefSync } from './stateRef'
import { IS_MOBILE } from '../atoms/scene'
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
  const { gl } = useThree()
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
      const dx = e.clientX - downPos.x, dy = e.clientY - downPos.y
      downPos = null
      if (Math.sqrt(dx * dx + dy * dy) > tapThreshold) return
      const rect = canvas.getBoundingClientRect()
      sceneRef.dof.focalUV = [
        (e.clientX - rect.left) / rect.width,
        1.0 - (e.clientY - rect.top) / rect.height,
      ]
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    return () => { canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp) }
  }, [gl])
  return null
}

export default function Scene() {
  // Mirror atom values into sceneRef so per-frame reads don't pay React cost.
  useSceneRefSync()

  const camera = useThree(({ camera }) => camera)
  const composerRef = useRef(null)
  const atmosphereRef = useRef(null)
  const dofRef = useRef(null)
  const [, forceRender] = useState(0)
  const cloudsRef = useRef(null)
  const aerialRef = useRef(null)

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

    // If there's a saved session, use its camera directly and skip the
    // Empire-State default. Otherwise, place the camera at the default
    // view (Empire State Building, NY) — see buildSavedView docblock for
    // the math behind distance/heading/pitch.
    try {
      const raw = localStorage.getItem('mapposter3d_poster_v2_session')
      if (raw) {
        const s = JSON.parse(raw)
        const c = s?.camera
        if (c && Array.isArray(c.position) && Array.isArray(c.quaternion) && Array.isArray(c.up)) {
          camera.position.set(c.position[0], c.position[1], c.position[2])
          camera.quaternion.set(c.quaternion[0], c.quaternion[1], c.quaternion[2], c.quaternion[3])
          camera.up.set(c.up[0], c.up[1], c.up[2])
          if (typeof c.fovMm === 'number') {
            camera.fov = 2 * Math.atan(36 / (2 * c.fovMm)) * 180 / Math.PI
            camera.updateProjectionMatrix()
          }
          return
        }
      }
    } catch (e) {}

    new PointOfView(1020, radians(70), radians(-30)).decompose(
      new Geodetic(radians(-73.985664), radians(40.748440), 190).toECEF(),
      camera.position, camera.quaternion, camera.up,
    )
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

  // Focal-length slider (fov-change) — mm → three.js fov degrees.
  // 35mm equivalent: fov = 2 * atan(36 / (2 * mm)) in degrees.
  useEffect(() => {
    const handler = (e) => {
      const mm = e.detail
      const fov = 2 * Math.atan(36 / (2 * mm)) * 180 / Math.PI
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    window.addEventListener('fov-change', handler)
    return () => window.removeEventListener('fov-change', handler)
  }, [camera])

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
        camera.fov = 2 * Math.atan(36 / (2 * v.fovMm)) * 180 / Math.PI
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
    // Toggle cloud shadows on aerial perspective
    const aerial = aerialRef.current
    if (aerial) {
      if (!sceneRef.clouds.shadows) {
        aerial.shadow = null
      }
      // When shadows are on, the Clouds change event handler restores it automatically
    }

    // Update DoF uniforms
    const fx = dofRef.current
    if (fx && fx.uniforms) {
      // Color pop is independent of DoF and always applied. When DoF is off,
      // it's always global (no focus area to limit it to). When DoF is on,
      // the user's globalPop toggle decides limited-to-focus vs. whole scene.
      fx.uniforms.get('colorPop').value = sceneRef.dof.colorPop / 100
      if (!sceneRef.dof.on) {
        fx.uniforms.get('maxBlur').value = 0
        fx.uniforms.get('globalPop').value = 1.0
      } else {
        fx.uniforms.get('focalPoint').value.set(sceneRef.dof.focalUV[0], sceneRef.dof.focalUV[1])
        const t = sceneRef.dof.tightness / 100
        fx.uniforms.get('depthRange').value = 3.0 * (1.0 - t) * (1.0 - t) + 0.005
        fx.uniforms.get('maxBlur').value = 2 + (sceneRef.dof.blur / 100) * 48
        fx.uniforms.get('globalPop').value = sceneRef.dof.globalPop ? 1.0 : 0.0
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
