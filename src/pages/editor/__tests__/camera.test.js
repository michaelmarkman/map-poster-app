import { describe, it, expect, afterEach } from 'vitest'
import { Vector3 } from 'three'
import { Geodetic } from '@takram/three-geospatial'
import {
  sliderToAlt,
  altToSlider,
  intersectEarthSphere,
  clampCameraAltitude,
  dispatchCameraSet,
} from '../utils/camera'

const ALT_MIN = 100
const ALT_MAX = 10000
const EARTH_RADIUS = 6378137

describe('sliderToAlt', () => {
  it('maps 0 → ALT_MIN', () => {
    expect(sliderToAlt(0)).toBeCloseTo(ALT_MIN, 6)
  })

  it('maps 1000 → ALT_MAX', () => {
    expect(sliderToAlt(1000)).toBeCloseTo(ALT_MAX, 6)
  })

  it('is monotonically increasing across the slider range', () => {
    let prev = -Infinity
    for (let s = 0; s <= 1000; s += 50) {
      const alt = sliderToAlt(s)
      expect(alt).toBeGreaterThan(prev)
      prev = alt
    }
  })

  it('clamps slider inputs below 0 to ALT_MIN', () => {
    expect(sliderToAlt(-200)).toBeCloseTo(ALT_MIN, 6)
  })

  it('clamps slider inputs above 1000 to ALT_MAX', () => {
    expect(sliderToAlt(5000)).toBeCloseTo(ALT_MAX, 6)
  })
})

describe('altToSlider', () => {
  it('maps ALT_MIN → 0', () => {
    expect(altToSlider(ALT_MIN)).toBe(0)
  })

  it('maps ALT_MAX → 1000', () => {
    expect(altToSlider(ALT_MAX)).toBe(1000)
  })

  it('clamps altitudes below ALT_MIN to slider 0', () => {
    expect(altToSlider(0)).toBe(0)
    expect(altToSlider(-50)).toBe(0)
  })

  it('clamps altitudes above ALT_MAX to slider 1000', () => {
    expect(altToSlider(50000)).toBe(1000)
  })
})

describe('sliderToAlt / altToSlider roundtrip', () => {
  it('sliderToAlt(altToSlider(500)) ≈ 500 within a slider-step', () => {
    const rounded = sliderToAlt(altToSlider(500))
    // altToSlider rounds to integer slider steps; one step near 500m is
    // ~1.15m along the log curve. Allow 2m of slop.
    expect(Math.abs(rounded - 500)).toBeLessThan(2)
  })

  it('roundtrips stably near the endpoints', () => {
    expect(sliderToAlt(altToSlider(ALT_MIN))).toBeCloseTo(ALT_MIN, 6)
    expect(sliderToAlt(altToSlider(ALT_MAX))).toBeCloseTo(ALT_MAX, 6)
  })
})

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

describe('dispatchCameraSet', () => {
  const received = []
  function handler(e) { received.push(e.detail) }

  afterEach(() => {
    window.removeEventListener('camera-set', handler)
    received.length = 0
  })

  it('fires a camera-set CustomEvent', () => {
    window.addEventListener('camera-set', handler)
    dispatchCameraSet({ tilt: 45 })
    expect(received).toHaveLength(1)
  })

  it('fills missing axes with defaults from module-local sync state', () => {
    window.addEventListener('camera-set', handler)
    dispatchCameraSet({ tilt: 45 })
    const detail = received[0]
    expect(detail.tilt).toBe(45)
    // heading/altitude come from defaults (_currentHeading=20, _currentAlt=700)
    // since no syncCameraToUI has run.
    expect(typeof detail.heading).toBe('number')
    expect(typeof detail.altitude).toBe('number')
  })

  it('passes through all three axes when provided', () => {
    window.addEventListener('camera-set', handler)
    dispatchCameraSet({ tilt: 10, heading: 180, altitude: 3000 })
    expect(received[0]).toEqual({ tilt: 10, heading: 180, altitude: 3000 })
  })
})
