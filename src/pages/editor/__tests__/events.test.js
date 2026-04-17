import { describe, it, expect, afterEach } from 'vitest'
import {
  dispatchCameraSet,
  dispatchFlyTo,
  dispatchEffectsChanged,
} from '../scene/events'

describe('dispatchCameraSet (scene/events)', () => {
  const received = []
  const handler = (e) => received.push(e)

  afterEach(() => {
    window.removeEventListener('camera-set', handler)
    received.length = 0
  })

  it('fires a camera-set event with only the provided axes', () => {
    window.addEventListener('camera-set', handler)
    dispatchCameraSet({ tilt: 30, heading: 90 })
    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('camera-set')
    expect(received[0].detail).toEqual({ tilt: 30, heading: 90 })
    expect('altitude' in received[0].detail).toBe(false)
    expect('fov' in received[0].detail).toBe(false)
  })

  it('omits null/undefined axes from detail', () => {
    window.addEventListener('camera-set', handler)
    dispatchCameraSet({ tilt: 15, heading: null, altitude: undefined, fov: 35 })
    expect(received[0].detail).toEqual({ tilt: 15, fov: 35 })
  })

  it('passes 0 as a valid value (does not drop falsy numbers)', () => {
    window.addEventListener('camera-set', handler)
    dispatchCameraSet({ tilt: 0, heading: 0 })
    expect(received[0].detail).toEqual({ tilt: 0, heading: 0 })
  })
})

describe('dispatchFlyTo', () => {
  const received = []
  const handler = (e) => received.push(e)

  afterEach(() => {
    window.removeEventListener('fly-to', handler)
    received.length = 0
  })

  it('fires fly-to with { lat, lng } detail', () => {
    window.addEventListener('fly-to', handler)
    dispatchFlyTo({ lat: 40, lng: -74 })
    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('fly-to')
    expect(received[0].detail).toEqual({ lat: 40, lng: -74 })
  })
})

describe('dispatchEffectsChanged', () => {
  const received = []
  const handler = (e) => received.push(e)

  afterEach(() => {
    window.removeEventListener('effects-changed', handler)
    received.length = 0
  })

  it('fires an effects-changed Event', () => {
    window.addEventListener('effects-changed', handler)
    dispatchEffectsChanged()
    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('effects-changed')
    // Plain Event (not CustomEvent) — no detail.
    expect(received[0] instanceof Event).toBe(true)
  })
})
