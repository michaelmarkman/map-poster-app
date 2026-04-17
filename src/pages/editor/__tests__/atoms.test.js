import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createStore } from 'jotai'

// We need to mock matchMedia BEFORE the atoms module runs (it reads
// matchMedia at module-load time for the IS_MOBILE flag).
beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('matchMedia', (query) => ({
    matches: false, // desktop: not narrow, not coarse
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('timeOfDayAtom', () => {
  it('default is 12', async () => {
    const { timeOfDayAtom } = await import('../atoms/scene')
    const s = createStore()
    expect(s.get(timeOfDayAtom)).toBe(12)
  })
})

describe('dofAtom', () => {
  it('default has on: true', async () => {
    const { dofAtom } = await import('../atoms/scene')
    const s = createStore()
    expect(s.get(dofAtom).on).toBe(true)
  })

  it('default focalUV is [0.5, 0.5]', async () => {
    const { dofAtom } = await import('../atoms/scene')
    const s = createStore()
    expect(s.get(dofAtom).focalUV).toEqual([0.5, 0.5])
  })
})

describe('cloudsAtom (desktop)', () => {
  it('default coverage is 0.2 when matchMedia reports desktop', async () => {
    const { cloudsAtom } = await import('../atoms/scene')
    const s = createStore()
    const clouds = s.get(cloudsAtom)
    expect(clouds.coverage).toBe(0.2)
  })

  it('enables shadows on desktop', async () => {
    const { cloudsAtom } = await import('../atoms/scene')
    const s = createStore()
    expect(s.get(cloudsAtom).shadows).toBe(true)
  })

  it('has on: true and not paused by default', async () => {
    const { cloudsAtom } = await import('../atoms/scene')
    const s = createStore()
    const clouds = s.get(cloudsAtom)
    expect(clouds.on).toBe(true)
    expect(clouds.paused).toBe(false)
  })
})
