// Prompt modifiers — toggleable additions layered on top of any AI render
// preset's base prompt. Two tiers:
//
//   atom      — one behavior each (people, cars, smoke, birds, ...).
//               Freely combinable.
//   composite — pre-composed bundle of behaviors with relationship-aware
//               language (e.g., "Bustling" = people + cars + smoke, but
//               the prompt also describes how pedestrians cluster near
//               intersections where cars are queued). Single chip in
//               the UI. Within an optional `group`, only ONE composite
//               can be active at a time (mutex). Atoms ignore groups.
//
// Composition order in src/pages/editor/hooks/useQueue.js
// `appendEffectPrompts`:
//   1. iterate composites, append each active one's prompt
//   2. track the union of `implies` keys from active composites
//   3. iterate atoms — append each active atom that ISN'T implied by
//      an active composite (the composite already covers it).
//
// `appliesTo` — soft filter: 'urban' | 'nature' | 'all'. The UI dims
// chips whose `appliesTo` doesn't match the detected locationContext
// but doesn't disable them — the user can override the classifier.

export const PROMPT_MODIFIERS = [
  // ── Themes (composites) ─────────────────────────────────────────
  {
    key: 'bustling',
    label: 'Bustling',
    appliesTo: 'urban',
    kind: 'composite',
    group: 'peopleflow',
    implies: ['people', 'cars', 'smoke'],
    prompt:
      'Make the scene feel lived-in and busy. Add a natural scattering of distant pedestrians on sidewalks and plazas, light traffic of period-appropriate cars on the streets (some parked, some moving), and thin wisps of chimney smoke from a handful of rooftops. The pedestrians and cars should compose together — people clustered near busy intersections, a few crossing at crosswalks where cars are queued. All elements tiny at this aerial scale, no faces, no foreground detail, no signage or text. Match the lighting and palette of the base style.',
  },
  {
    key: 'rush_hour',
    label: 'Rush hour',
    appliesTo: 'urban',
    kind: 'composite',
    group: 'peopleflow',
    implies: ['people', 'cars'],
    prompt:
      'Make the scene read as commuter rush hour. Streets visibly busier — denser traffic of cars on main thoroughfares (some queued at intersections), pedestrians moving in directional flows along sidewalks toward transit hubs or away from them. The composition between people and cars should suggest a city in motion: cars stopped at red lights with people crossing, sidewalks fuller near subway entrances if any are visible. All elements tiny at this aerial scale, no faces, no foreground detail, no signage. Match the lighting and palette of the base style.',
  },
  {
    key: 'festive',
    label: 'Festive evening',
    appliesTo: 'urban',
    kind: 'composite',
    implies: ['lights', 'people', 'smoke'],
    prompt:
      'Make this read as the city dressed up for a winter evening event. Subtle warm festive string lights on a few buildings, trees, and along main streets — small glowing points, not garish. A sparse scattering of distant pedestrians on the lit streets, suggesting people are out for the occasion. Thin wisps of chimney smoke from cozy rooftops. Warm windows glowing from interiors. No foreground detail, no faces, no text or banners.',
  },
  {
    key: 'wild',
    label: 'Wild',
    appliesTo: 'nature',
    kind: 'composite',
    implies: ['wildlife', 'birds'],
    prompt:
      'Add a small, sparse scattering of native wildlife in the landscape — distant figures (deer, elk, sheep, or similar appropriate to this terrain) in clearings, meadows, or along treelines, plus a few birds in flight against the sky. The wildlife and birds together should feel like an undisturbed scene momentarily observed from above. Tiny at this scale, no foreground animals, naturalistic spacing, match the lighting and palette of the base style.',
  },
  {
    key: 'coastal',
    label: 'Coastal life',
    appliesTo: 'all',
    kind: 'composite',
    implies: ['boats', 'birds'],
    prompt:
      'Animate the waterfront. Add a sparse scattering of small boats on visible water (sailboats, fishing boats, the occasional ferry — period-appropriate to the base style) plus a few seabirds in flight along the shore and over the water. Tiny at this scale, no wake spray detail, no foreground birds or boats. Match the lighting and palette of the base style.',
  },

  // ── Atoms ───────────────────────────────────────────────────────
  {
    key: 'people',
    label: 'People',
    appliesTo: 'urban',
    kind: 'atom',
    prompt:
      'Add a sparse, natural scattering of distant pedestrian figures on sidewalks and plazas — small, anonymous silhouettes at this altitude, no faces or detail. Match the lighting and palette of the base style. Do NOT add buildings, vehicles, signage, or anything else not requested.',
  },
  {
    key: 'cars',
    label: 'Cars',
    appliesTo: 'urban',
    kind: 'atom',
    prompt:
      'Add a realistic light scattering of parked and moving cars on the streets visible in the scene — small, distant, period-appropriate to the base style. No buses, trucks, or large vehicles unless the base style implies them. Do NOT add pedestrians, signage, or buildings.',
  },
  {
    key: 'smoke',
    label: 'Chimney smoke',
    appliesTo: 'urban',
    kind: 'atom',
    prompt:
      'Add thin wisps of chimney smoke rising from a few rooftops — soft, sparse, drifting in the prevailing direction implied by the base style. Not industrial; this is a cozy lived-in city signal.',
  },
  {
    key: 'lights',
    label: 'Festive lights',
    appliesTo: 'urban',
    kind: 'atom',
    prompt:
      'Add subtle warm festive string lights on a few buildings and trees — small glowing points, not garish. As if the city is dressed up for an evening event.',
  },
  {
    key: 'birds',
    label: 'Birds',
    appliesTo: 'all',
    kind: 'atom',
    prompt:
      'Add a few birds in flight against the sky — small distant silhouettes, naturalistic spacing, matching the lighting of the base style. No flocks, no foreground birds, no detail.',
  },
  {
    key: 'wildlife',
    label: 'Wildlife',
    appliesTo: 'nature',
    kind: 'atom',
    prompt:
      'Add a small, sparse scattering of native wildlife appropriate to this landscape — distant figures (deer, elk, sheep, or similar) in clearings or along treelines. Tiny at this scale, no foreground animals, no detail.',
  },
  {
    key: 'boats',
    label: 'Boats',
    appliesTo: 'all',
    kind: 'atom',
    prompt:
      'Add a sparse scattering of small boats on any visible water — period-appropriate to the base style. Tiny at this scale, no wake spray, no foreground boats.',
  },
  {
    key: 'balloons',
    label: 'Hot air balloons',
    appliesTo: 'all',
    kind: 'atom',
    prompt:
      'Add 2–4 colorful hot air balloons drifting in the sky at varying distances. Tiny at this scale; the balloons should feel incidental rather than dominate the composition.',
  },
]

// O(1) lookup for the chip click handler + the prompt composer.
export const MODIFIER_BY_KEY = Object.fromEntries(
  PROMPT_MODIFIERS.map((m) => [m.key, m]),
)

// Apply group-mutex when adding a key to an active set. Used by the
// CaptureMenu toggle handler; lifted here so the tests can pin it.
export function applyModifierToggle(activeSet, key) {
  const next = new Set(activeSet)
  if (next.has(key)) {
    next.delete(key)
    return next
  }
  const mod = MODIFIER_BY_KEY[key]
  if (mod?.group) {
    for (const peer of PROMPT_MODIFIERS) {
      if (peer.group === mod.group && peer.key !== key) {
        next.delete(peer.key)
      }
    }
  }
  next.add(key)
  return next
}

// Two-pass append used by useQueue's appendEffectPrompts. Lifted here
// (instead of inline) so it can be unit-tested without spinning up the
// queue hook.
export function appendModifierPrompts(base, activeSet) {
  if (!activeSet || activeSet.size === 0) return base
  let out = base
  const implied = new Set()
  for (const mod of PROMPT_MODIFIERS) {
    if (mod.kind !== 'composite' || !activeSet.has(mod.key)) continue
    out += ' ' + mod.prompt
    for (const k of mod.implies || []) implied.add(k)
  }
  for (const mod of PROMPT_MODIFIERS) {
    if (mod.kind === 'composite' || !activeSet.has(mod.key)) continue
    if (implied.has(mod.key)) continue
    out += ' ' + mod.prompt
  }
  return out
}

// UI helper: a chip is "implied-only" (chartreuse outline state) when
// it's an atom that's covered by an active composite — whether or not
// the user explicitly toggled the atom on too. Used for the visual
// affordance only; the prompt logic skips implied atoms separately.
export function impliedAtomKeys(activeSet) {
  if (!activeSet || activeSet.size === 0) return new Set()
  const implied = new Set()
  for (const mod of PROMPT_MODIFIERS) {
    if (mod.kind !== 'composite' || !activeSet.has(mod.key)) continue
    for (const k of mod.implies || []) implied.add(k)
  }
  return implied
}
