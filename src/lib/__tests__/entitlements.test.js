import { describe, it, expect } from 'vitest'
import {
  TIERS,
  canSaveAnotherView,
  canSubmitRender,
  canUseResolution,
  getTier,
  getTierLimits,
  shouldShowWatermark,
} from '../entitlements'

describe('getTier', () => {
  it('returns "free" for null / unknown profiles', () => {
    expect(getTier(null)).toBe('free')
    expect(getTier(undefined)).toBe('free')
    expect(getTier({})).toBe('free')
    expect(getTier({ tier: 'unknown' })).toBe('free')
  })
  it('returns "pro" when profile.tier is pro', () => {
    expect(getTier({ tier: 'pro' })).toBe('pro')
  })
})

describe('getTierLimits', () => {
  it('points at the right TIERS entry', () => {
    expect(getTierLimits(null)).toBe(TIERS.free)
    expect(getTierLimits({ tier: 'pro' })).toBe(TIERS.pro)
  })
})

describe('canSubmitRender', () => {
  it('allows submission below the free limit', () => {
    expect(canSubmitRender({ profile: null, count: 0 }).ok).toBe(true)
    expect(canSubmitRender({ profile: null, count: 4 }).ok).toBe(true)
  })
  it('blocks once the free limit is hit', () => {
    const r = canSubmitRender({ profile: null, count: 5 })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/Free/i)
  })
  it('Pro users have effectively no limit', () => {
    expect(canSubmitRender({ profile: { tier: 'pro' }, count: 9999 }).ok).toBe(true)
  })
  it('BYOK bypasses the count entirely', () => {
    expect(
      canSubmitRender({ profile: null, count: 999, byokKey: 'sk-...' }).ok,
    ).toBe(true)
  })
})

describe('canUseResolution', () => {
  it('caps free at 2x', () => {
    expect(canUseResolution({ profile: null, multiplier: 1 })).toBe(true)
    expect(canUseResolution({ profile: null, multiplier: 2 })).toBe(true)
    expect(canUseResolution({ profile: null, multiplier: 3 })).toBe(false)
  })
  it('Pro goes up to 6x', () => {
    expect(canUseResolution({ profile: { tier: 'pro' }, multiplier: 6 })).toBe(true)
    expect(canUseResolution({ profile: { tier: 'pro' }, multiplier: 7 })).toBe(false)
  })
})

describe('shouldShowWatermark', () => {
  it('shows for free tier', () => {
    expect(shouldShowWatermark({ profile: null })).toBe(true)
  })
  it('hides for Pro', () => {
    expect(shouldShowWatermark({ profile: { tier: 'pro' } })).toBe(false)
  })
  it('hides for BYOK regardless of tier', () => {
    expect(shouldShowWatermark({ profile: null, byokKey: 'sk-...' })).toBe(false)
  })
})

describe('canSaveAnotherView', () => {
  it('caps free at 5 views', () => {
    expect(canSaveAnotherView({ profile: null, currentCount: 4 })).toBe(true)
    expect(canSaveAnotherView({ profile: null, currentCount: 5 })).toBe(false)
  })
  it('Pro saves unlimited', () => {
    expect(canSaveAnotherView({ profile: { tier: 'pro' }, currentCount: 99 })).toBe(true)
  })
})
