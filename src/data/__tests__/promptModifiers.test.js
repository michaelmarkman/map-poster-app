import { describe, it, expect } from 'vitest'
import {
  PROMPT_MODIFIERS,
  MODIFIER_BY_KEY,
  applyModifierToggle,
  appendModifierPrompts,
  impliedAtomKeys,
} from '../promptModifiers'

// Pin shape + key invariants — if someone renames a key or drops a
// `kind` field without updating consumers (CaptureMenu chip render,
// appendEffectPrompts in useQueue), this catches it.

describe('PROMPT_MODIFIERS registry shape', () => {
  it('every entry has key, label, kind, prompt, appliesTo', () => {
    for (const m of PROMPT_MODIFIERS) {
      expect(typeof m.key).toBe('string')
      expect(typeof m.label).toBe('string')
      expect(['atom', 'composite']).toContain(m.kind)
      expect(typeof m.prompt).toBe('string')
      expect(['urban', 'nature', 'all']).toContain(m.appliesTo)
    }
  })

  it('keys are unique', () => {
    const keys = PROMPT_MODIFIERS.map((m) => m.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every composite-implies key references a real atomic modifier', () => {
    for (const m of PROMPT_MODIFIERS) {
      if (m.kind !== 'composite' || !m.implies) continue
      for (const k of m.implies) {
        const target = MODIFIER_BY_KEY[k]
        expect(target, `${m.key} implies ${k}`).toBeDefined()
        expect(target.kind).toBe('atom')
      }
    }
  })
})

describe('applyModifierToggle', () => {
  it('adds a key that isn\'t in the set', () => {
    const next = applyModifierToggle(new Set(), 'people')
    expect(next.has('people')).toBe(true)
  })

  it('removes a key that is already in the set', () => {
    const next = applyModifierToggle(new Set(['people']), 'people')
    expect(next.has('people')).toBe(false)
  })

  it('does not affect other keys when toggling one', () => {
    const next = applyModifierToggle(new Set(['birds', 'people']), 'cars')
    expect(next.has('birds')).toBe(true)
    expect(next.has('people')).toBe(true)
    expect(next.has('cars')).toBe(true)
  })

  it('enforces group mutex — picking bustling removes rush_hour', () => {
    const next = applyModifierToggle(new Set(['rush_hour']), 'bustling')
    expect(next.has('bustling')).toBe(true)
    expect(next.has('rush_hour')).toBe(false)
  })

  it('enforces group mutex — picking rush_hour removes bustling', () => {
    const next = applyModifierToggle(new Set(['bustling']), 'rush_hour')
    expect(next.has('rush_hour')).toBe(true)
    expect(next.has('bustling')).toBe(false)
  })

  it('leaves cross-group composites alone', () => {
    // Festive is not in `peopleflow`; bustling + festive both stay
    const next = applyModifierToggle(new Set(['bustling']), 'festive')
    expect(next.has('bustling')).toBe(true)
    expect(next.has('festive')).toBe(true)
  })

  it('returns a new Set (does not mutate input)', () => {
    const input = new Set(['people'])
    const out = applyModifierToggle(input, 'cars')
    expect(input.has('cars')).toBe(false) // unchanged
    expect(out.has('cars')).toBe(true)
  })
})

describe('appendModifierPrompts', () => {
  it('returns base unchanged when no modifiers active', () => {
    expect(appendModifierPrompts('base', new Set())).toBe('base')
    expect(appendModifierPrompts('base', null)).toBe('base')
    expect(appendModifierPrompts('base', undefined)).toBe('base')
  })

  it('appends a single atom\'s prompt with leading space', () => {
    const out = appendModifierPrompts('BASE.', new Set(['people']))
    expect(out.startsWith('BASE. ')).toBe(true)
    expect(out).toContain('pedestrian')
  })

  it('appends multiple atoms in registry order', () => {
    const out = appendModifierPrompts('B.', new Set(['cars', 'birds', 'people']))
    // Registry order is: people, cars, smoke, lights, birds, wildlife,
    // boats, balloons. So output ordering should be: people then cars
    // then birds.
    const peopleIdx = out.indexOf('pedestrian')
    const carsIdx = out.indexOf('parked and moving cars')
    const birdsIdx = out.indexOf('birds in flight')
    expect(peopleIdx).toBeLessThan(carsIdx)
    expect(carsIdx).toBeLessThan(birdsIdx)
  })

  it('appends the composite prompt when only the composite is active', () => {
    const out = appendModifierPrompts('B.', new Set(['bustling']))
    expect(out).toContain('lived-in and busy')
    // Should NOT also append the atomic people/cars/smoke prompts.
    expect(out).not.toContain('Add a sparse, natural scattering of distant pedestrian')
  })

  it('skips implied atoms when their composite is active', () => {
    // Bustling implies [people, cars, smoke]. Even if the user also
    // toggled the atoms (e.g., they picked them first then added the
    // composite), the atom prompts get skipped — composite covers them.
    const out = appendModifierPrompts(
      'B.',
      new Set(['bustling', 'people', 'cars', 'smoke']),
    )
    expect(out).toContain('lived-in and busy')
    expect(out).not.toContain('Add a sparse, natural scattering of distant pedestrian')
  })

  it('appends non-implied atoms alongside the composite', () => {
    // Bustling implies [people, cars, smoke]. Birds is NOT in the
    // implied set, so it should append.
    const out = appendModifierPrompts('B.', new Set(['bustling', 'birds']))
    expect(out).toContain('lived-in and busy')
    expect(out).toContain('birds in flight')
  })

  it('appends multiple non-grouped composites together', () => {
    const out = appendModifierPrompts('B.', new Set(['festive', 'wild']))
    expect(out).toContain('dressed up for a winter evening event')
    expect(out).toContain('native wildlife')
  })
})

describe('impliedAtomKeys', () => {
  it('returns an empty Set when no composites active', () => {
    expect(impliedAtomKeys(new Set()).size).toBe(0)
    expect(impliedAtomKeys(new Set(['people'])).size).toBe(0)
  })

  it('returns the union of implies for active composites', () => {
    const out = impliedAtomKeys(new Set(['bustling']))
    expect(out.has('people')).toBe(true)
    expect(out.has('cars')).toBe(true)
    expect(out.has('smoke')).toBe(true)
    expect(out.has('birds')).toBe(false)
  })

  it('unions across multiple composites', () => {
    const out = impliedAtomKeys(new Set(['bustling', 'wild']))
    expect(out.has('people')).toBe(true)  // from bustling
    expect(out.has('wildlife')).toBe(true) // from wild
    expect(out.has('birds')).toBe(true)    // from wild
  })
})
