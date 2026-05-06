// Bridge-specific tests for setActiveProfile / getActiveProfile and
// the gate functions' "no-arg → bridge" path. The main entitlements
// suite tests behavior with profile passed explicitly.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  canSubmitRender,
  canSaveAnotherView,
  canUseResolution,
  getActiveProfile,
  getTier,
  getTierLimits,
  setActiveProfile,
  shouldShowWatermark,
} from '../entitlements'

describe('active profile bridge', () => {
  beforeEach(() => {
    setActiveProfile(null)
  })

  it('round-trips set/get', () => {
    expect(getActiveProfile()).toBe(null)
    setActiveProfile({ tier: 'pro', email: 'a@b' })
    expect(getActiveProfile()).toEqual({ tier: 'pro', email: 'a@b' })
    setActiveProfile(null)
    expect(getActiveProfile()).toBe(null)
  })

  it('getTier reads from the bridge when no arg passed', () => {
    setActiveProfile({ tier: 'pro' })
    expect(getTier()).toBe('pro')
    setActiveProfile(null)
    expect(getTier()).toBe('free')
  })

  it('getTierLimits picks up the bridge profile', () => {
    setActiveProfile({ tier: 'pro' })
    expect(getTierLimits().label).toBe('Pro')
    setActiveProfile(null)
    expect(getTierLimits().label).toBe('Free')
  })

  it('canSubmitRender uses the bridge tier', () => {
    setActiveProfile({ tier: 'pro' })
    expect(canSubmitRender({ count: 9999 }).ok).toBe(true)
    setActiveProfile(null)
    expect(canSubmitRender({ count: 9999 }).ok).toBe(false)
  })

  it('canUseResolution uses the bridge tier', () => {
    expect(canUseResolution({ multiplier: 4 })).toBe(false) // free max 2
    setActiveProfile({ tier: 'pro' })
    expect(canUseResolution({ multiplier: 4 })).toBe(true) // pro max 6
  })

  it('shouldShowWatermark uses the bridge tier', () => {
    expect(shouldShowWatermark()).toBe(true) // free
    setActiveProfile({ tier: 'pro' })
    expect(shouldShowWatermark()).toBe(false) // pro
  })

  it('canSaveAnotherView uses the bridge tier', () => {
    expect(canSaveAnotherView({ currentCount: 5 })).toBe(false) // free cap 5
    setActiveProfile({ tier: 'pro' })
    expect(canSaveAnotherView({ currentCount: 999 })).toBe(true) // pro unlimited
  })

  it('an explicit profile arg still overrides the bridge', () => {
    setActiveProfile({ tier: 'pro' })
    // Pass null explicitly — should NOT use the pro bridge value.
    expect(getTier(null)).toBe('free')
    expect(canSubmitRender({ profile: null, count: 9999 }).ok).toBe(false)
  })
})
