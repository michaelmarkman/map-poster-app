import { describe, it, expect, vi } from 'vitest'
import { fireToast } from '../toast'

describe('fireToast', () => {
  it("dispatches a 'toast' CustomEvent with type+message in detail", () => {
    const events = []
    const handler = (e) => events.push(e)
    window.addEventListener('toast', handler)
    try {
      fireToast('success', 'Saved!')
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('toast')
      expect(events[0].detail).toEqual({ type: 'success', message: 'Saved!' })
    } finally {
      window.removeEventListener('toast', handler)
    }
  })

  it('passes type variants through unchanged', () => {
    const events = []
    const handler = (e) => events.push(e.detail)
    window.addEventListener('toast', handler)
    try {
      fireToast('error', 'oops')
      fireToast('info', 'fyi')
      fireToast('success', 'yay')
      expect(events).toEqual([
        { type: 'error', message: 'oops' },
        { type: 'info', message: 'fyi' },
        { type: 'success', message: 'yay' },
      ])
    } finally {
      window.removeEventListener('toast', handler)
    }
  })

  it('swallows dispatchEvent errors so callers never have to wrap', () => {
    const original = window.dispatchEvent
    window.dispatchEvent = vi.fn(() => { throw new Error('boom') })
    try {
      // Must not re-throw — toasts are decorative, never load-bearing.
      expect(() => fireToast('success', 'x')).not.toThrow()
    } finally {
      window.dispatchEvent = original
    }
  })
})
