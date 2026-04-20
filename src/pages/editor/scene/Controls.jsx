import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector2, Vector3, Raycaster as RaycasterClass } from 'three'
import { Geodetic } from '@takram/three-geospatial'
import { useSetAtom } from 'jotai'
import { sceneRef } from './stateRef'
import { intersectEarthSphere } from '../utils/camera'
import { dofAtom } from '../atoms/scene'

// WASD flight — each frame, move the camera in the direction of the held keys
// along the local tangent plane (W/S = forward along ground, A/D = strafe,
// Q/E/Space = down/up). Speed scales with altitude so flight feels natural
// at every zoom level.
function WasdFly() {
  const camera = useThree(({ camera }) => camera)
  const keysRef = useRef({})

  useEffect(() => {
    const onDown = (e) => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      keysRef.current[e.key.toLowerCase()] = true
    }
    const onUp = (e) => { keysRef.current[e.key.toLowerCase()] = false }
    const onBlur = () => { keysRef.current = {} }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useFrame((_, delta) => {
    if (sceneRef.editorActive || window.__editorActive) return
    const k = keysRef.current
    if (!k.w && !k.a && !k.s && !k.d && !k.q && !k.e && !k[' ']) return

    // Speed scales with altitude so flight feels natural
    const geo = new Geodetic().setFromECEF(camera.position)
    const alt = Math.max(100, geo.height)
    let speed = alt * 0.8 * delta
    if (k.shift) speed *= 4

    const up = camera.position.clone().normalize()
    const fwd = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize()
    // Flatten forward onto tangent plane — W/S don't change altitude
    const flatFwd = fwd.clone().sub(up.clone().multiplyScalar(fwd.dot(up))).normalize()
    const right = new Vector3().crossVectors(flatFwd, up).normalize()

    const move = new Vector3()
    if (k.w) move.addScaledVector(flatFwd, speed)
    if (k.s) move.addScaledVector(flatFwd, -speed)
    if (k.d) move.addScaledVector(right, speed)
    if (k.a) move.addScaledVector(right, -speed)
    if (k.e || k[' ']) move.addScaledVector(up, speed)
    if (k.q) move.addScaledVector(up, -speed)

    camera.position.add(move)
  })

  return null
}

// FOV listener with dolly zoom — when the user changes the focal-length
// slider, we raycast the screen center to find the point the camera is
// looking at, then move the camera along the view ray so that point stays
// the same size on screen (dolly zoom). Falls back to Earth-sphere
// intersection when no geometry is under the reticle.
function FovListener() {
  const { camera, scene } = useThree()
  const raycaster = useRef(new RaycasterClass())
  const centerNDC = useRef(new Vector2(0, 0))
  const setDof = useSetAtom(dofAtom)

  useEffect(() => {
    const handler = (e) => {
      const mm = e.detail
      // Read current camera fov directly — don't cache it, since session
      // restore or saved views can change it without us knowing.
      const oldFov = camera.fov
      const newFov = 2 * Math.atan(12 / mm) * 180 / Math.PI
      if (Math.abs(oldFov - newFov) < 0.01) return

      // Dolly zoom: raycast center of screen to find the target point.
      // We try the loaded geometry first (photogrammetry tiles), then fall
      // back to intersecting the view ray with the Earth sphere so the
      // effect still works when looking at the horizon or at angles where
      // no tile is directly under the reticle.
      raycaster.current.setFromCamera(centerNDC.current, camera)
      const hits = raycaster.current.intersectObjects(scene.children, true)
      const target = hits.length > 0
        ? hits[0].point
        : intersectEarthSphere(raycaster.current.ray.origin, raycaster.current.ray.direction)

      if (target) {
        const oldDist = camera.position.distanceTo(target)
        // visible_size ∝ dist * tan(fov/2)
        const oldHalfRad = (oldFov * Math.PI / 180) / 2
        const newHalfRad = (newFov * Math.PI / 180) / 2
        const newDist = oldDist * Math.tan(oldHalfRad) / Math.tan(newHalfRad)
        const dir = camera.position.clone().sub(target).normalize()
        camera.position.copy(target).add(dir.multiplyScalar(newDist))
      }

      camera.fov = newFov
      camera.updateProjectionMatrix()

      // Adjust DoF tightness to match focal length (longer lens = shallower
      // DoF). Writes through the atom so the sidebar slider updates.
      if (sceneRef.dof.on) {
        const focalScale = Math.sqrt(mm / 41)
        const newTightness = Math.round(Math.min(100, Math.max(50, 55 + 20 * focalScale)))
        setDof((d) => ({ ...d, tightness: newTightness }))
      }
    }
    window.addEventListener('fov-change', handler)
    return () => window.removeEventListener('fov-change', handler)
  }, [camera, scene, setDof])

  return null
}

// Scroll-wheel dolly — moves the camera along its view direction. Scroll up
// (deltaY negative) goes forward, scroll down (positive) pulls back. Speed
// scales with altitude so the gesture feels right at street level and high
// up. The default wheel-on-canvas behavior is page scroll, which we suppress
// with passive:false + preventDefault.
function ScrollDolly() {
  const { gl, camera } = useThree()
  useEffect(() => {
    const canvas = gl.domElement
    const tmpFwd = new Vector3()
    const tmpGeo = new Geodetic()
    const onWheel = (e) => {
      if (sceneRef.editorActive || window.__editorActive) return
      e.preventDefault()
      const alt = Math.max(50, tmpGeo.setFromECEF(camera.position).height)
      // 0.0006 chosen to feel close to a Maps zoom step on a typical mouse
      // wheel; trackpads with finer deltas get correspondingly finer steps.
      const step = -e.deltaY * alt * 0.0006
      tmpFwd.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize()
      camera.position.addScaledVector(tmpFwd, step)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [gl, camera])
  return null
}

export default function Controls() {
  return (
    <>
      <WasdFly />
      <FovListener />
      <ScrollDolly />
    </>
  )
}
