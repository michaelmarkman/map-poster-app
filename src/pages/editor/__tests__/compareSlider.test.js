import { describe, it, expect } from 'vitest'
import { aspectLabel, clampPct, computeSliderPct } from '../modals/Lightbox'

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

describe('aspectLabel', () => {
  it('returns null for invalid input', () => {
    expect(aspectLabel(null)).toBeNull()
    expect(aspectLabel(undefined)).toBeNull()
    expect(aspectLabel(NaN)).toBeNull()
    expect(aspectLabel(0)).toBeNull()
    expect(aspectLabel(-1.5)).toBeNull()
  })

  it('maps known ratios to their canonical labels', () => {
    expect(aspectLabel(1 / 1)).toBe('1:1')
    expect(aspectLabel(3 / 4)).toBe('3:4')
    expect(aspectLabel(4 / 5)).toBe('4:5')
    expect(aspectLabel(2 / 3)).toBe('2:3')
    expect(aspectLabel(9 / 16)).toBe('9:16')
    expect(aspectLabel(5 / 4)).toBe('5:4')
    expect(aspectLabel(4 / 3)).toBe('4:3')
    expect(aspectLabel(3 / 2)).toBe('3:2')
    expect(aspectLabel(16 / 9)).toBe('16:9')
  })

  it('tolerates ~1% float imprecision around known ratios', () => {
    expect(aspectLabel(0.7499)).toBe('3:4')      // 3/4 ≈ 0.75
    expect(aspectLabel(1.7777)).toBe('16:9')      // 16/9 ≈ 1.7777
    expect(aspectLabel(1.499)).toBe('3:2')        // 3/2 = 1.5
  })

  it('falls back to decimal w:h notation for landscape custom ratios', () => {
    expect(aspectLabel(2.0)).toBe('2.00:1')
    expect(aspectLabel(2.35)).toBe('2.35:1')
  })

  it('falls back to 1:w decimal notation for portrait custom ratios', () => {
    expect(aspectLabel(0.5)).toBe('1:2.00')
    expect(aspectLabel(0.42)).toBe('1:2.38')
  })
})
