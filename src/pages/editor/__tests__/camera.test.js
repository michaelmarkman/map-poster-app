import { describe, it, expect } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { Geodetic } from '@takram/three-geospatial'
import {
  intersectEarthSphere,
  clampCameraAltitude,
  syncCameraToUI,
} from '../utils/camera'

const EARTH_RADIUS = 6378137

describe('intersectEarthSphere', () => {
  it('returns a point on the sphere when the ray points inward', () => {
    // Origin 1000km above the north pole, direction pointing down toward origin.
    const origin = new Vector3(0, 0, EARTH_RADIUS + 1_000_000)
    const dir = new Vector3(0, 0, -1)
    const hit = intersectEarthSphere(origin, dir)
    expect(hit).not.toBeNull()
    const r = Math.sqrt(hit.x * hit.x + hit.y * hit.y + hit.z * hit.z)
    expect(r).toBeCloseTo(EARTH_RADIUS, 0)
    // Hit should be on the near side (positive z).
    expect(hit.z).toBeGreaterThan(0)
  })

  it('returns null when the ray points away from the sphere', () => {
    // Outside the sphere, direction pointing outward.
    const origin = new Vector3(EARTH_RADIUS + 1_000_000, 0, 0)
    const dir = new Vector3(1, 0, 0)
    const hit = intersectEarthSphere(origin, dir)
    expect(hit).toBeNull()
  })

  it('returns null when the ray misses the sphere', () => {
    // Offset well above the pole with a tangent that misses.
    const origin = new Vector3(0, 0, EARTH_RADIUS + 10_000_000)
    const dir = new Vector3(1, 0, 0)
    const hit = intersectEarthSphere(origin, dir)
    expect(hit).toBeNull()
  })
})

describe('clampCameraAltitude', () => {
  // Build a fake camera with a position Vector3 at a given altitude above sea
  // level on the prime meridian / equator.
  function makeCamera(altitude) {
    const pos = new Geodetic(0, 0, altitude).toECEF()
    return { position: new Vector3(pos.x, pos.y, pos.z) }
  }

  it('does not modify camera above the soft band (> 30m)', () => {
    const camera = makeCamera(500)
    const before = camera.position.clone()
    clampCameraAltitude(camera)
    expect(camera.position.x).toBeCloseTo(before.x, 3)
    expect(camera.position.y).toBeCloseTo(before.y, 3)
    expect(camera.position.z).toBeCloseTo(before.z, 3)
  })

  it('does not modify a camera at the band ceiling', () => {
    // GROUND_CLAMP_MIN_ALT (5) + GROUND_CLAMP_BAND (25) = 30m: exactly the ceiling
    const camera = makeCamera(35)
    const before = camera.position.clone()
    clampCameraAltitude(camera)
    expect(camera.position.distanceTo(before)).toBeLessThan(0.01)
  })

  it('applies an upward pull when well below the band', () => {
    const camera = makeCamera(0)
    const altBefore = new Geodetic().setFromECEF(camera.position).height
    clampCameraAltitude(camera)
    const altAfter = new Geodetic().setFromECEF(camera.position).height
    expect(altAfter).toBeGreaterThan(altBefore)
  })

  it('pulls harder as penetration deepens', () => {
    const shallow = makeCamera(20)
    const deep = makeCamera(-5)
    const shallowBefore = new Geodetic().setFromECEF(shallow.position).height
    const deepBefore = new Geodetic().setFromECEF(deep.position).height
    clampCameraAltitude(shallow)
    clampCameraAltitude(deep)
    const shallowDelta = new Geodetic().setFromECEF(shallow.position).height - shallowBefore
    const deepDelta = new Geodetic().setFromECEF(deep.position).height - deepBefore
    expect(deepDelta).toBeGreaterThan(shallowDelta)
  })
})

describe('syncCameraToUI', () => {
  // Build a fake camera at a given geodetic position with identity
  // quaternion + a known fov. Throttle inside syncCameraToUI is
  // module-state (200ms), so each test calls it after a delay — but
  // since vitest runs files in fresh workers, the first call in this
  // describe block goes through cleanly.
  function makeCamera(lat, lng, alt, fovDeg = 45) {
    const pos = new Geodetic(lng * Math.PI / 180, lat * Math.PI / 180, alt).toECEF()
    return {
      position: new Vector3(pos.x, pos.y, pos.z),
      quaternion: new Quaternion(),
      fov: fovDeg,
    }
  }

  it('writes latitude + longitude (degrees) in the readout payload', async () => {
    const camera = makeCamera(40.7484, -73.9857, 500)
    let readout = null
    syncCameraToUI(camera, (r) => { readout = r })
    expect(readout).not.toBeNull()
    // Lat/lng survive ECEF round-trip with ~1e-6 degree precision.
    expect(readout.latitude).toBeCloseTo(40.7484, 4)
    expect(readout.longitude).toBeCloseTo(-73.9857, 4)
    // And the legacy fields still come through unchanged.
    expect(readout).toHaveProperty('tilt')
    expect(readout).toHaveProperty('heading')
    expect(readout).toHaveProperty('altitude')
    expect(readout).toHaveProperty('fovMm')
    // 200ms throttle — wait it out before the next sync call.
    await new Promise((r) => setTimeout(r, 220))
  })

  it('correctly converts radians → degrees for a southern-hemisphere point', async () => {
    const camera = makeCamera(-33.8688, 151.2093, 1000)  // Sydney
    let readout = null
    syncCameraToUI(camera, (r) => { readout = r })
    expect(readout.latitude).toBeCloseTo(-33.8688, 4)
    expect(readout.longitude).toBeCloseTo(151.2093, 4)
  })
})

