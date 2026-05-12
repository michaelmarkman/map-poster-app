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

  // Phase 20 — paywall disabled. Free tier mirrors Pro across every
  // gate. The bridge still reads through correctly; tests below verify
  // the wiring without asserting specific cap behavior.

  it('canSubmitRender uses the bridge tier', () => {
    setActiveProfile({ tier: 'pro' })
    expect(canSubmitRender({ count: 9999 }).ok).toBe(true)
    setActiveProfile(null)
    // Paywall disabled — free now allows too.
    expect(canSubmitRender({ count: 9999 }).ok).toBe(true)
  })

  it('canUseResolution uses the bridge tier', () => {
    expect(canUseResolution({ multiplier: 6 })).toBe(true) // free now allows 6x
    setActiveProfile({ tier: 'pro' })
    expect(canUseResolution({ multiplier: 6 })).toBe(true) // pro max 6
  })

  it('shouldShowWatermark uses the bridge tier', () => {
    expect(shouldShowWatermark()).toBe(false) // free — watermark disabled
    setActiveProfile({ tier: 'pro' })
    expect(shouldShowWatermark()).toBe(false) // pro — watermark disabled
  })

  it('canSaveAnotherView uses the bridge tier', () => {
    expect(canSaveAnotherView({ currentCount: 9999 })).toBe(true) // free unlimited
    setActiveProfile({ tier: 'pro' })
    expect(canSaveAnotherView({ currentCount: 9999 })).toBe(true) // pro unlimited
  })

  it('an explicit profile arg still overrides the bridge', () => {
    setActiveProfile({ tier: 'pro' })
    // Bridge says pro; explicit null arg still resolves to free.
    expect(getTier(null)).toBe('free')
    // Both free + pro now allow renders (paywall disabled), so this
    // just verifies the lookup path — both return ok regardless.
    expect(canSubmitRender({ profile: null, count: 9999 }).ok).toBe(true)
  })
})
