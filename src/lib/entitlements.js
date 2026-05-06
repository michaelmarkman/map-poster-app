// Vedute entitlements — single source of truth for what each tier can do.
//
// Phase 6 scaffolding. The numbers below are PLACEHOLDERS from the roadmap
// plan and need to be tuned before launch. The shape is final though;
// downstream gates (useQueue render-submit check, profile UI, BYOK bypass)
// already point at this file so tweaking limits is one place.
//
// TIER RESOLUTION:
//   1. Logged-out / guest    → 'free' (most restrictive)
//   2. Logged-in, no Stripe  → 'free'
//   3. Logged-in, Stripe Pro → 'pro'
//   4. BYOK (any tier)       → bypass entitlements entirely (see below)
//
// BYOK bypass: if the user has set their own Gemini API key
// (vedute_gemini_key in localStorage / aiApiKeyAtom), AI render submissions
// skip the credit deduction in `canSubmitRender` — they're paying Google
// directly. Resolution + watermark gates still apply (those are Vedute's
// product, not the model's).

export const TIERS = {
  free: {
    label: 'Free',
    rendersPerMonth: 5,
    maxResolutionMultiplier: 2,
    showWatermark: true,
    maxSavedViews: 5,
  },
  pro: {
    label: 'Pro',
    rendersPerMonth: Infinity,
    maxResolutionMultiplier: 6,
    showWatermark: false,
    maxSavedViews: Infinity,
  },
}

// Resolve the user's effective tier. `profile` shape comes from Supabase
// (src/contexts/AuthContext.jsx). Falls back to 'free' for guests / unset.
export function getTier(profile) {
  if (profile?.tier === 'pro') return 'pro'
  return 'free'
}

export function getTierLimits(profile) {
  return TIERS[getTier(profile)]
}

// Render submission gate. Returns:
//   { ok: true } if the render can proceed
//   { ok: false, reason: string } if it should be blocked
//
// `count` is the user's renders-this-month, sourced from Supabase or the
// local persistence layer. `byokKey` truthy bypasses the count check.
export function canSubmitRender({ profile, count, byokKey }) {
  if (byokKey) return { ok: true }
  const limits = getTierLimits(profile)
  if (count >= limits.rendersPerMonth) {
    return {
      ok: false,
      reason: `${limits.label} tier is capped at ${limits.rendersPerMonth} renders/month. Upgrade to Pro or set your own Gemini key.`,
    }
  }
  return { ok: true }
}

// Resolution gate. UI surfaces blocked options as disabled with a tooltip.
export function canUseResolution({ profile, multiplier }) {
  const limits = getTierLimits(profile)
  return multiplier <= limits.maxResolutionMultiplier
}

// Watermark gate. Used by the export pipeline to decide whether to bake
// a Vedute wordmark into the bottom-right of the rendered PNG.
export function shouldShowWatermark({ profile, byokKey }) {
  if (byokKey) return false // BYOK bypasses watermark too
  return getTierLimits(profile).showWatermark
}

// Saved views gate.
export function canSaveAnotherView({ profile, currentCount }) {
  const limits = getTierLimits(profile)
  return currentCount < limits.maxSavedViews
}
