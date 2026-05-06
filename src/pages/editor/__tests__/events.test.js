import { describe, it, expect, afterEach } from 'vitest'
import { dispatchFlyTo } from '../scene/events'

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

  it('passes through 0 / negative coords as valid', () => {
    window.addEventListener('fly-to', handler)
    dispatchFlyTo({ lat: 0, lng: 0 })
    expect(received[0].detail).toEqual({ lat: 0, lng: 0 })
    received.length = 0
    dispatchFlyTo({ lat: -89.5, lng: -180 })
    expect(received[0].detail).toEqual({ lat: -89.5, lng: -180 })
  })
})
