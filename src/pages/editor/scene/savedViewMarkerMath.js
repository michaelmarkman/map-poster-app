// Pure helpers for the saved-view marker layer. Kept separate from
// SavedViewMarkers.jsx so the math is unit-testable without an R3F runtime.

import { Raycaster, Vector2, PerspectiveCamera, Vector3 } from 'three'

// Camera altitude (m above ground/ellipsoid) → marker opacity.
//   ≤ 1km altitude → fully opaque
//   ≥ 5km altitude → fully transparent
//   linear in between
// Picked these values empirically: a city scene reads cleanly below ~1km
// (markers are large enough relative to terrain), and by 5km the camera
// can see a region wide enough that markers cluster into noise.
export const ALT_OPAQUE_BELOW = 1000
export const ALT_TRANSPARENT_ABOVE = 5000

export function altitudeToOpacity(altitudeMeters) {
  if (altitudeMeters <= ALT_OPAQUE_BELOW) return 1
  if (altitudeMeters >= ALT_TRANSPARENT_ABOVE) return 0
  const span = ALT_TRANSPARENT_ABOVE - ALT_OPAQUE_BELOW
  const t = (altitudeMeters - ALT_OPAQUE_BELOW) / span
  return 1 - t
}

const _ndc = new Vector2()
const _raycaster = new Raycaster()
const _virtualCam = new PerspectiveCamera()

// Given a saved view (camera position + quaternion + fov + focalUV) and the
// live scene graph, raycast from the saved viewpoint through focalUV and
// return the world-space hit point. Returns null on miss (caller falls
// back to ellipsoid drop).
//
// We DON'T move the live camera — we configure a virtual PerspectiveCamera
// with the saved transform and fire the ray from there. That way this can
// run while the user has flown elsewhere; the marker layer doesn't depend
// on the user being at the saved position.
//
// `nameRejectRegex` matches mesh names we consider "shells" (atmosphere,
// clouds, ellipsoid stand-ins). Mirrors the filter in Scene.jsx's
// click-to-focus raycast so we don't lock onto the sky.
export function resolveFocalWorld(view, scene, opts = {}) {
  const maxDist = opts.maxDist ?? 20000
  const nameRejectRegex = opts.nameRejectRegex ?? /atmosphere|cloud|ellipsoid|sky|globe/i

  const cam = view.camera
  if (!cam || !Array.isArray(cam.position) || !Array.isArray(cam.quaternion)) return null

  _virtualCam.position.fromArray(cam.position)
  _virtualCam.quaternion.fromArray(cam.quaternion)
  _virtualCam.fov = cam.fov ?? 37.8
  _virtualCam.aspect = opts.aspect ?? 1
  _virtualCam.near = 1
  _virtualCam.far = 1e7
  _virtualCam.updateProjectionMatrix()
  _virtualCam.updateMatrixWorld(true)

  const uv = view.focalUV ?? [0.5, 0.5]
  _ndc.set(uv[0] * 2 - 1, uv[1] * 2 - 1)
  _raycaster.setFromCamera(_ndc, _virtualCam)

  const hits = _raycaster.intersectObjects(scene.children, true)
  for (const h of hits) {
    const d = _virtualCam.position.distanceTo(h.point)
    if (d < 1 || d > maxDist) continue
    const name = (h.object?.name || '').toLowerCase()
    if (nameRejectRegex.test(name)) continue
    if (h.object?.isAtmosphereMesh || h.object?.isCloudsEffect) continue
    return new Vector3(h.point.x, h.point.y, h.point.z)
  }
  return null
}
