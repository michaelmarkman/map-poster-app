import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getRenderCount,
  incrementRenderCount,
  resetRenderCount,
} from '../renderCount'

describe('renderCount', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts at 0', () => {
    expect(getRenderCount()).toBe(0)
  })

  it('increments and persists', () => {
    expect(incrementRenderCount()).toBe(1)
    expect(incrementRenderCount(2)).toBe(3)
    expect(getRenderCount()).toBe(3)
  })

  it('persists across reads (separate function calls)', () => {
    incrementRenderCount(5)
    expect(getRenderCount()).toBe(5)
  })

  it('resets at month boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z'))
    incrementRenderCount(3)
    expect(getRenderCount()).toBe(3)

    // Advance to next month
    vi.setSystemTime(new Date('2026-06-01T00:01:00Z'))
    expect(getRenderCount()).toBe(0)

    incrementRenderCount(1)
    expect(getRenderCount()).toBe(1)
  })

  it('resetRenderCount clears the counter for the current month', () => {
    incrementRenderCount(7)
    resetRenderCount()
    expect(getRenderCount()).toBe(0)
  })

  it('survives a corrupted localStorage value', () => {
    localStorage.setItem('vedute_render_count', '{not json')
    expect(getRenderCount()).toBe(0)
    expect(incrementRenderCount()).toBe(1)
  })
})
