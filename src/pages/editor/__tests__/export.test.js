import { describe, it, expect } from 'vitest'
import { applyWatermark, buildFilename } from '../utils/export'

describe('applyWatermark', () => {
  // jsdom's <canvas> stub returns a synthetic data URL; that's enough to
  // verify the function's contract without exercising real pixel work.
  // (jsdom + vitest don't ship a full canvas raster path; the integration
  // smoke test on a real browser is the proof we draw correctly.)

  it('returns the input unchanged when given falsy input', async () => {
    expect(await applyWatermark(null)).toBe(null)
    expect(await applyWatermark('')).toBe('')
    expect(await applyWatermark(undefined)).toBe(undefined)
  })

  it('always returns a Promise (never throws synchronously)', () => {
    // jsdom Image neither fires onload nor onerror for synthetic URLs,
    // so we can't fully exercise the redraw path here — the integration
    // smoke against a real browser covers that. What we lock in here:
    // the function ALWAYS hands back a Promise so callers can
    // unconditionally await it.
    expect(applyWatermark('data:image/png;base64,abc')).toBeInstanceOf(Promise)
    expect(applyWatermark(null)).toBeInstanceOf(Promise)
  })
})

describe('buildFilename', () => {
  it('starts with the vedute prefix', () => {
    const f = buildFilename('raw')
    expect(f.startsWith('vedute-')).toBe(true)
  })

  it('slugifies the location and style', () => {
    const f = buildFilename('Golden Hour', { location: 'New York, NY', resolution: 2 })
    expect(f).toMatch(/^vedute-new-york-golden-hour-2x-/)
  })

  it('omits the resolution suffix when 1x', () => {
    const f = buildFilename('raw', { resolution: 1 })
    expect(f).not.toMatch(/-1x-/)
  })

  it('appends a date + time stamp', () => {
    const f = buildFilename('raw')
    // pattern: ...-YYYYMMDD-HHMM
    expect(f).toMatch(/-\d{8}-\d{4}$/)
  })
})
