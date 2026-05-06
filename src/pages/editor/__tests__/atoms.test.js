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
  it("doesn't carry an `on` boolean — aperture is the source of truth", async () => {
    const { dofAtom } = await import('../atoms/scene')
    const s = createStore()
    const dof = s.get(dofAtom)
    expect('on' in dof).toBe(false)
  })

  it('default aperture is 4.5 (DoF on; aperture===0 would be off)', async () => {
    const { dofAtom } = await import('../atoms/scene')
    const s = createStore()
    expect(s.get(dofAtom).aperture).toBe(4.5)
  })

  it('default focalUV is [0.5, 0.5]', async () => {
    const { dofAtom } = await import('../atoms/scene')
    const s = createStore()
    expect(s.get(dofAtom).focalUV).toEqual([0.5, 0.5])
  })

  it('default sceneColorPop and focusColorPop are both 25', async () => {
    const { dofAtom } = await import('../atoms/scene')
    const s = createStore()
    const dof = s.get(dofAtom)
    expect(dof.sceneColorPop).toBe(25)
    expect(dof.focusColorPop).toBe(25)
  })
})

describe('cloudsAtom', () => {
  it('default coverage is 0.2', async () => {
    const { cloudsAtom } = await import('../atoms/scene')
    const s = createStore()
    expect(s.get(cloudsAtom).coverage).toBe(0.2)
  })

  it("doesn't carry an `on` boolean — coverage===0 disables clouds", async () => {
    const { cloudsAtom } = await import('../atoms/scene')
    const s = createStore()
    const clouds = s.get(cloudsAtom)
    expect('on' in clouds).toBe(false)
  })

  it('not paused by default', async () => {
    const { cloudsAtom } = await import('../atoms/scene')
    const s = createStore()
    expect(s.get(cloudsAtom).paused).toBe(false)
  })
})
