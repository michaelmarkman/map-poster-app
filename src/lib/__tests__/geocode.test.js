import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { geocodeSearch, reverseGeocodeName } from '../geocode'

const ORIG_FETCH = global.fetch

beforeEach(() => {
  global.fetch = vi.fn()
})
afterEach(() => {
  global.fetch = ORIG_FETCH
})

describe('geocodeSearch', () => {
  it('returns null for empty query', async () => {
    expect(await geocodeSearch('')).toBe(null)
    expect(await geocodeSearch('   ')).toBe(null)
    expect(await geocodeSearch(null)).toBe(null)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns the top result on success', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '40.7128', lon: '-74.006', display_name: 'New York, NY, USA' }],
    })
    const r = await geocodeSearch('new york')
    expect(r).toEqual({ lat: 40.7128, lng: -74.006, displayName: 'New York, NY, USA' })
    expect(global.fetch).toHaveBeenCalledOnce()
  })

  it('returns null on empty result array', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => [] })
    expect(await geocodeSearch('asdfqwerty')).toBe(null)
  })

  it('returns null on non-OK response', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, json: async () => [] })
    expect(await geocodeSearch('foo')).toBe(null)
  })

  it('returns null on fetch failure (never throws)', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network'))
    expect(await geocodeSearch('foo')).toBe(null)
  })

  it('sends a Vedute User-Agent header', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '0', lon: '0', display_name: 'x' }],
    })
    await geocodeSearch('x')
    const opts = global.fetch.mock.calls[0][1]
    expect(opts.headers['User-Agent']).toMatch(/Vedute/)
  })
})

describe('reverseGeocodeName', () => {
  it('returns null on invalid coordinates', async () => {
    expect(await reverseGeocodeName(NaN, 0)).toBe(null)
    expect(await reverseGeocodeName(0, Infinity)).toBe(null)
    expect(await reverseGeocodeName('lat', 'lng')).toBe(null)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('prefers neighbourhood over fallbacks', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        address: { neighbourhood: 'East Village', city: 'New York' },
        display_name: 'East Village, Manhattan, New York',
      }),
    })
    expect(await reverseGeocodeName(40.7, -73.99)).toBe('East Village')
  })

  it('falls through neighbourhood → suburb → city_district → town → village → hamlet → city', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        address: { city: 'New York' },
        display_name: 'New York, NY',
      }),
    })
    expect(await reverseGeocodeName(40.7, -73.99)).toBe('New York')
  })

  it('falls back to display_name first segment when address fields missing', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ display_name: 'Foo, Bar, Baz' }),
    })
    expect(await reverseGeocodeName(0, 0)).toBe('Foo')
  })

  it('returns null on network failure', async () => {
    global.fetch.mockRejectedValueOnce(new Error('boom'))
    expect(await reverseGeocodeName(40, -70)).toBe(null)
  })
})
