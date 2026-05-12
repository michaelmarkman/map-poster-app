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

// Phase 20 — paywall disabled. Free tier now mirrors Pro across every
// dimension. The TIERS shape + gate functions stay defined so the
// entitlements machinery is ready to re-engage when Stripe lands.

describe('canSubmitRender', () => {
  it('allows submission at any count for free tier', () => {
    expect(canSubmitRender({ profile: null, count: 0 }).ok).toBe(true)
    expect(canSubmitRender({ profile: null, count: 9999 }).ok).toBe(true)
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
  it('allows up to 6× for free tier', () => {
    expect(canUseResolution({ profile: null, multiplier: 1 })).toBe(true)
    expect(canUseResolution({ profile: null, multiplier: 4 })).toBe(true)
    expect(canUseResolution({ profile: null, multiplier: 6 })).toBe(true)
    expect(canUseResolution({ profile: null, multiplier: 7 })).toBe(false)
  })
  it('Pro goes up to 6x', () => {
    expect(canUseResolution({ profile: { tier: 'pro' }, multiplier: 6 })).toBe(true)
    expect(canUseResolution({ profile: { tier: 'pro' }, multiplier: 7 })).toBe(false)
  })
})

describe('shouldShowWatermark', () => {
  it('hides for free tier (paywall disabled)', () => {
    expect(shouldShowWatermark({ profile: null })).toBe(false)
  })
  it('hides for Pro', () => {
    expect(shouldShowWatermark({ profile: { tier: 'pro' } })).toBe(false)
  })
})

describe('canSaveAnotherView', () => {
  it('allows unlimited saves for free tier', () => {
    expect(canSaveAnotherView({ profile: null, currentCount: 4 })).toBe(true)
    expect(canSaveAnotherView({ profile: null, currentCount: 9999 })).toBe(true)
  })
  it('Pro saves unlimited', () => {
    expect(canSaveAnotherView({ profile: { tier: 'pro' }, currentCount: 99 })).toBe(true)
  })
})
