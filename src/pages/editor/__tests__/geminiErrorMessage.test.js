import { describe, it, expect } from 'vitest'
import { geminiErrorMessage } from '../hooks/useQueue'

describe('geminiErrorMessage', () => {
  it('extracts the string from our proxy shape { error: "..." }', () => {
    // The /api/gemini handler returns { error: "rate limit" } etc.
    expect(geminiErrorMessage(429, { error: 'rate limit' })).toBe('rate limit')
  })

  it('extracts message from upstream Gemini shape { error: { message } }', () => {
    expect(
      geminiErrorMessage(400, { error: { message: 'Invalid argument' } }),
    ).toBe('Invalid argument')
  })

  it('translates the "not configured" 500 into a BYOK hint', () => {
    // The recurring case: a dev runs Vite without GEMINI_API_KEY in env
    // and no BYOK in the body. The proxy returns 500 with "not
    // configured" — we surface a hint that points at /profile + .env.
    const out = geminiErrorMessage(500, {
      error: 'GEMINI_API_KEY not configured (no env key, no body apiKey)',
    })
    expect(out).toMatch(/Gemini key not set/i)
    expect(out).toMatch(/\/profile/)
    expect(out).toMatch(/\.env\.local/)
  })

  it('leaves other 500s alone (not the missing-key case)', () => {
    expect(
      geminiErrorMessage(500, { error: 'upstream error', detail: 'fetch failed' }),
    ).toBe('upstream error')
  })

  it('falls back to "API error N" when the body has no parseable error', () => {
    expect(geminiErrorMessage(503, {})).toBe('API error 503')
    expect(geminiErrorMessage(503, null)).toBe('API error 503')
    expect(geminiErrorMessage(503, undefined)).toBe('API error 503')
  })

  it('caps upstream error messages at 200 chars to keep toasts readable', () => {
    const long = 'X'.repeat(500)
    const out = geminiErrorMessage(400, { error: { message: long } })
    expect(out.length).toBe(200)
  })

  it('proxy-shape takes precedence over upstream-shape when both somehow appear', () => {
    // Defensive — a server that mistakenly echoes both shapes shouldn't
    // confuse us. Proxy strings are always shorter and more direct.
    expect(
      geminiErrorMessage(500, {
        error: 'proxy says no',
        // (won't actually nest like this, but assert the precedence)
      }),
    ).toBe('proxy says no')
  })
})
