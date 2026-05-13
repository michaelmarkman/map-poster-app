import { describe, it, expect } from 'vitest'
import {
  PHOTOGRAMMETRY_CLEANUP_PROMPT,
  buildPromptParts,
  joinPromptParts,
} from '../hooks/useQueue'

// buildPromptParts splits a composed AI prompt into 4 named segments
// (base, geometry, depth, modifiers) — each null when its gating
// condition isn't met. joinPromptParts inverts that. The Lightbox's
// segmented-prompt panel reads these to render colored hoverable
// spans for each ingredient.

const BASE = 'Re-render this as a photoreal cityscape.'

describe('buildPromptParts', () => {
  it('returns base only when no flags are set', () => {
    const parts = buildPromptParts(BASE, {})
    expect(parts.base).toBe(BASE)
    expect(parts.geometry).toBeNull()
    expect(parts.depth).toBeNull()
    expect(parts.modifiers).toBeNull()
  })

  it('adds geometry when aiCleanArtifacts is true', () => {
    const parts = buildPromptParts(BASE, { aiCleanArtifacts: true })
    expect(parts.geometry).toBe(PHOTOGRAMMETRY_CLEANUP_PROMPT)
  })

  it('skips geometry when aiCleanArtifacts is false', () => {
    const parts = buildPromptParts(BASE, { aiCleanArtifacts: false })
    expect(parts.geometry).toBeNull()
  })

  it('adds depth when aperture > 0', () => {
    const parts = buildPromptParts(BASE, { dof: { aperture: 2.8 } })
    expect(parts.depth).toContain('Preserve the depth-of-field blur')
    expect(parts.depth).toContain('f/2.8')
  })

  it('skips depth when aperture is 0 or missing', () => {
    expect(buildPromptParts(BASE, { dof: { aperture: 0 } }).depth).toBeNull()
    expect(buildPromptParts(BASE, { dof: null }).depth).toBeNull()
    expect(buildPromptParts(BASE, {}).depth).toBeNull()
  })

  it('adds modifiers when at least one is active', () => {
    const parts = buildPromptParts(BASE, {
      aiModifiers: new Set(['birds']),
    })
    expect(parts.modifiers).toBeTruthy()
    expect(parts.modifiers).toContain('birds in flight')
  })

  it('skips modifiers when none are active', () => {
    expect(buildPromptParts(BASE, { aiModifiers: new Set() }).modifiers).toBeNull()
    expect(buildPromptParts(BASE, { aiModifiers: null }).modifiers).toBeNull()
  })

  it('composes all four parts together', () => {
    const parts = buildPromptParts(BASE, {
      aiCleanArtifacts: true,
      dof: { aperture: 4 },
      aiModifiers: new Set(['birds']),
    })
    expect(parts.base).toBe(BASE)
    expect(parts.geometry).toBe(PHOTOGRAMMETRY_CLEANUP_PROMPT)
    expect(parts.depth).toContain('f/4')
    expect(parts.modifiers).toContain('birds in flight')
  })

  it('skips implied atoms when their composite is active (modifier diff is composite-only)', () => {
    // Bustling implies people + cars + smoke. With Bustling active,
    // the modifiers segment should contain Bustling's text but NOT
    // the atomic people/cars/smoke prompts.
    const parts = buildPromptParts(BASE, {
      aiModifiers: new Set(['bustling', 'people', 'cars']),
    })
    expect(parts.modifiers).toContain('lived-in and busy')
    // The atomic people prompt starts with this phrase — confirm it's
    // NOT appended because Bustling covers it.
    expect(parts.modifiers).not.toContain('Add a sparse, natural scattering of distant pedestrian')
  })
})

describe('joinPromptParts', () => {
  it('concatenates all 4 segments into one string', () => {
    const joined = joinPromptParts({
      base: 'A',
      geometry: ' B',
      depth: ' C',
      modifiers: ' D',
    })
    expect(joined).toBe('A B C D')
  })

  it('treats null segments as empty', () => {
    const joined = joinPromptParts({
      base: 'A',
      geometry: null,
      depth: null,
      modifiers: null,
    })
    expect(joined).toBe('A')
  })

  it('returns empty string when given null', () => {
    expect(joinPromptParts(null)).toBe('')
    expect(joinPromptParts(undefined)).toBe('')
  })

  it('round-trips with buildPromptParts (split, then join)', () => {
    const settings = {
      aiCleanArtifacts: true,
      dof: { aperture: 5.6 },
      aiModifiers: new Set(['birds', 'people']),
    }
    const parts = buildPromptParts(BASE, settings)
    const joined = joinPromptParts(parts)
    // Joined output must contain the base AND every appended segment
    // in source order.
    expect(joined.startsWith(BASE)).toBe(true)
    const baseIdx = joined.indexOf(BASE)
    const geoIdx = joined.indexOf('photogrammetry capture')
    const depthIdx = joined.indexOf('Preserve the depth-of-field')
    const peopleIdx = joined.indexOf('distant pedestrian figures')
    const birdsIdx = joined.indexOf('birds in flight')
    expect(baseIdx).toBe(0)
    expect(geoIdx).toBeGreaterThan(baseIdx)
    expect(depthIdx).toBeGreaterThan(geoIdx)
    // Modifiers appended last; people + birds both there.
    expect(peopleIdx).toBeGreaterThan(depthIdx)
    expect(birdsIdx).toBeGreaterThan(depthIdx)
  })
})
