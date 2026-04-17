import { Vector3 } from 'three'
import { Geodetic, radians } from '@takram/three-geospatial'

// Module-local state — used to coalesce slider writes. These are values the
// sidebar reads back at ~5Hz, and also the defaults dispatchCameraSet falls
// back to when the user changes only one axis (tilt/heading/alt).
let _lastSync = 0
let _currentTilt = 60
let _currentHeading = 20
let _currentAlt = 700
let _suppressSliderInput = false

// Log mapping for altitude slider: 0-1000 slider range → 100m-10000m altitude
const ALT_MIN = 100
const ALT_MAX = 10000

export function sliderToAlt(s) {
  const t = Math.max(0, Math.min(1000, s)) / 1000
  return ALT_MIN * Math.pow(ALT_MAX / ALT_MIN, t)
}

export function altToSlider(alt) {
  const clamped = Math.max(ALT_MIN, Math.min(ALT_MAX, alt))
  return Math.round(1000 * Math.log(clamped / ALT_MIN) / Math.log(ALT_MAX / ALT_MIN))
}

// Ray/Earth-sphere intersection using the WGS84 equatorial radius. Used as a
// fallback for dolly zoom when no loaded geometry is under the screen center
// (e.g. looking at the horizon). Returns the near hit or null.
const EARTH_RADIUS = 6378137
export function intersectEarthSphere(origin, dir) {
  const a = dir.dot(dir)
  const b = 2 * origin.dot(dir)
  const c = origin.dot(origin) - EARTH_RADIUS * EARTH_RADIUS
  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  if (t < 0) return null
  return origin.clone().addScaledVector(dir, t)
}

// Minimum altitude above sea level the camera is allowed to reach. Low enough
// to let you skim rooftops in flat areas, but high enough to prevent diving
// straight through the ellipsoid.
const GROUND_CLAMP_MIN_ALT = 5
// How deep the buffer zone extends above the hard floor. Within this band,
// we apply a soft upward lerp that ramps from 0 at the top of the band to
// the full strength at the floor. Gives the "bouncing off" feel.
const GROUND_CLAMP_BAND = 25

export function clampCameraAltitude(camera) {
  try {
    const geo = new Geodetic().setFromECEF(camera.position)
    const alt = geo.height
    if (alt >= GROUND_CLAMP_MIN_ALT + GROUND_CLAMP_BAND) return

    // Target: same lat/lng but at the floor. We lerp toward this; when
    // penetration is deep the pull is firm, when you're just grazing the
    // band it's feather-light.
    const target = new Geodetic(geo.longitude, geo.latitude, GROUND_CLAMP_MIN_ALT).toECEF()
    const penetration = Math.max(0, (GROUND_CLAMP_MIN_ALT + GROUND_CLAMP_BAND - alt) / GROUND_CLAMP_BAND)
    const strength = Math.min(0.45, penetration * penetration * 0.6)
    camera.position.lerp(target, strength)
  } catch (e) {}
}

// Reads live camera geometry and calls `setReadout({tilt, heading, altitude,
// fovMm})` with current values. Throttled to 5Hz so we don't pay React
// render cost per frame. Designed to be called from useFrame.
export function syncCameraToUI(camera, setReadout) {
  const now = Date.now()
  if (now - _lastSync < 200) return
  _lastSync = now

  try {
    const pos = camera.position
    const geo = new Geodetic().setFromECEF(pos)
    const alt = Math.round(Math.max(0, geo.height))
    _currentAlt = alt

    const up = pos.clone().normalize()
    const fwd = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize()

    // Tilt: 0 = straight down, 90 = horizon
    const downDot = fwd.dot(up.clone().negate())
    const tilt = Math.round(Math.acos(Math.max(-1, Math.min(1, downDot))) * 180 / Math.PI)
    _currentTilt = Math.max(0, Math.min(90, tilt))

    // Heading: 0 = north, 90 = east
    const pole = new Vector3(0, 0, 1)
    const east = new Vector3().crossVectors(pole, up).normalize()
    const north = new Vector3().crossVectors(up, east).normalize()
    const flatFwd = fwd.clone().sub(up.clone().multiplyScalar(fwd.dot(up))).normalize()
    const heading = Math.round(Math.atan2(flatFwd.dot(east), flatFwd.dot(north)) * 180 / Math.PI)
    _currentHeading = heading

    // FOV → 35mm equivalent focal length
    const mm = Math.max(14, Math.min(200, Math.round(12 / Math.tan(camera.fov * Math.PI / 360))))

    _suppressSliderInput = true
    setReadout?.({ tilt: _currentTilt, heading, altitude: alt, fovMm: mm })
    _suppressSliderInput = false
  } catch (e) {}
}

// Dispatch camera-set event with desired tilt/heading/alt. Falls back to the
// last synced values so a single-axis change keeps the other two stable.
export function dispatchCameraSet(partial) {
  if (_suppressSliderInput) return
  window.dispatchEvent(new CustomEvent('camera-set', {
    detail: {
      tilt: partial.tilt ?? _currentTilt,
      heading: partial.heading ?? _currentHeading,
      altitude: partial.altitude ?? _currentAlt,
    },
  }))
}
