import { describe, it, expect } from 'vitest'
import { dofPromptSuffix } from '../hooks/useQueue'

// Regression test for the Phase-2.7 migration miss: when `dof.on` was
// retired in favor of "aperture > 0 means on", the useQueue gate for
// the preserve-DoF prompt instruction was never updated, so DoF was
// silently dropped from EVERY AI render even when the user had it on.
//
// Pinning the gate via a pure helper means the test catches a future
// regression (e.g. someone refactoring useQueue and reintroducing a
// stale `.on` read) before it ships.
describe('dofPromptSuffix', () => {
  it('returns empty string when aperture is 0 (DoF disabled)', () => {
    expect(dofPromptSuffix(0)).toBe('')
  })

  it('returns empty string for undefined / null / NaN aperture', () => {
    expect(dofPromptSuffix(undefined)).toBe('')
    expect(dofPromptSuffix(null)).toBe('')
    expect(dofPromptSuffix(NaN)).toBe('')
  })

  it('returns empty string for negative apertures (invalid input)', () => {
    expect(dofPromptSuffix(-1)).toBe('')
  })

  it('returns the preserve-DoF clause when aperture > 0', () => {
    const out = dofPromptSuffix(2.8)
    expect(out).toMatch(/Preserve the depth-of-field/)
    expect(out).toMatch(/tack-sharp/)
    expect(out).toMatch(/Do NOT sharpen blurred regions/)
  })

  it('mentions the actual f-stop so the AI can match bokeh intensity', () => {
    expect(dofPromptSuffix(2.8)).toMatch(/f\/2\.8/)
    expect(dofPromptSuffix(4.5)).toMatch(/f\/4\.5/)
  })

  it('rounds wide-open apertures (>=10) to integer f-stops', () => {
    expect(dofPromptSuffix(11)).toMatch(/f\/11/)
    expect(dofPromptSuffix(16)).toMatch(/f\/16/)
  })

  it('formats narrow apertures (<10) to one decimal place', () => {
    expect(dofPromptSuffix(1.4)).toMatch(/f\/1\.4/)
    expect(dofPromptSuffix(8)).toMatch(/f\/8\.0/)
  })
})
