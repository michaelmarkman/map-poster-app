import { describe, it, expect } from 'vitest'
import { clampPct, computeSliderPct } from '../modals/Lightbox'

// Pure-helper tests for the Compare slider math. The full
// CompareSlider component needs jsdom + image-load events to exercise
// orientation detection, so we test the math standalone here.

describe('clampPct', () => {
  it('returns 50 for non-finite input', () => {
    expect(clampPct(NaN)).toBe(50)
    expect(clampPct(Infinity)).toBe(50)
    expect(clampPct(-Infinity)).toBe(50)
    expect(clampPct(undefined)).toBe(50)
  })

  it('clamps to [0, 100]', () => {
    expect(clampPct(-5)).toBe(0)
    expect(clampPct(0)).toBe(0)
    expect(clampPct(50)).toBe(50)
    expect(clampPct(100)).toBe(100)
    expect(clampPct(150)).toBe(100)
  })
})

describe('computeSliderPct', () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 }

  it('returns 50 for a zero-size rect', () => {
    expect(computeSliderPct({
      orientation: 'vertical',
      rect: { left: 0, top: 0, width: 0, height: 0 },
      clientX: 0,
      clientY: 0,
    })).toBe(50)
    expect(computeSliderPct({
      orientation: 'horizontal',
      rect: null,
      clientX: 0,
      clientY: 0,
    })).toBe(50)
  })

  it('vertical: maps clientX across rect.width to 0–100', () => {
    expect(computeSliderPct({ orientation: 'vertical', rect, clientX: 100, clientY: 0 })).toBe(0)
    expect(computeSliderPct({ orientation: 'vertical', rect, clientX: 200, clientY: 0 })).toBe(50)
    expect(computeSliderPct({ orientation: 'vertical', rect, clientX: 300, clientY: 0 })).toBe(100)
  })

  it('horizontal: maps clientY across rect.height to 0–100', () => {
    expect(computeSliderPct({ orientation: 'horizontal', rect, clientX: 0, clientY: 50 })).toBe(0)
    expect(computeSliderPct({ orientation: 'horizontal', rect, clientX: 0, clientY: 100 })).toBe(50)
    expect(computeSliderPct({ orientation: 'horizontal', rect, clientX: 0, clientY: 150 })).toBe(100)
  })

  it('clamps when the pointer is outside the rect', () => {
    expect(computeSliderPct({ orientation: 'vertical', rect, clientX: 50, clientY: 0 })).toBe(0)   // left of rect
    expect(computeSliderPct({ orientation: 'vertical', rect, clientX: 999, clientY: 0 })).toBe(100) // right of rect
    expect(computeSliderPct({ orientation: 'horizontal', rect, clientX: 0, clientY: -10 })).toBe(0)
    expect(computeSliderPct({ orientation: 'horizontal', rect, clientX: 0, clientY: 999 })).toBe(100)
  })
})
