import { describe, it, expect } from 'vitest'
import { altitudeToOpacity, resolveFocalWorld } from '../scene/savedViewMarkerMath'

describe('altitudeToOpacity', () => {
  it('returns 1 when below the lower threshold', () => {
    expect(altitudeToOpacity(500)).toBe(1)
    expect(altitudeToOpacity(1000)).toBe(1)
  })

  it('returns 0 when above the upper threshold', () => {
    expect(altitudeToOpacity(5000)).toBe(0)
    expect(altitudeToOpacity(7500)).toBe(0)
  })

  it('linearly interpolates between thresholds', () => {
    // halfway between 1000 and 5000 → 0.5 opacity
    expect(altitudeToOpacity(3000)).toBeCloseTo(0.5, 5)
  })

  it('clamps negative altitudes to fully opaque', () => {
    expect(altitudeToOpacity(-50)).toBe(1)
  })
})

describe('resolveFocalWorld', () => {
  function fakeScene() {
    return { children: [] }
  }
  function viewAt(pos = [0, 0, 100]) {
    return {
      camera: { position: pos, quaternion: [0, 0, 0, 1], fov: 60 },
      focalUV: [0.5, 0.5],
    }
  }

  it('returns null when the scene is empty', () => {
    const w = resolveFocalWorld(viewAt(), fakeScene())
    expect(w).toBe(null)
  })

  it('returns null when view has no camera', () => {
    const w = resolveFocalWorld({ focalUV: [0.5, 0.5] }, fakeScene())
    expect(w).toBe(null)
  })

  it('returns null when view.camera lacks position', () => {
    const w = resolveFocalWorld({ camera: { fov: 60 }, focalUV: [0.5, 0.5] }, fakeScene())
    expect(w).toBe(null)
  })
})
