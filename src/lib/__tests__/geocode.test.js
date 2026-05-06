import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { geocodeSearch, reverseGeocodeName, searchPlaces } from '../geocode'

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

describe('searchPlaces', () => {
  it('returns [] for empty query', async () => {
    expect(await searchPlaces('')).toEqual([])
    expect(await searchPlaces('   ')).toEqual([])
    expect(await searchPlaces(null)).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('uses /api/places when the proxy returns predictions', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        predictions: [
          { description: 'New York, NY, USA', placeId: 'p1', mainText: 'New York', secondaryText: 'NY, USA' },
        ],
      }),
    })
    const r = await searchPlaces('new york')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ description: 'New York, NY, USA', placeId: 'p1' })
    expect(global.fetch).toHaveBeenCalledOnce()
    expect(global.fetch.mock.calls[0][0]).toBe('/api/places')
  })

  it('falls back to Nominatim when /api/places returns 501 / fallback:true', async () => {
    // First call: Places proxy returns the 501 stub shape.
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'places_not_configured', fallback: true }),
    })
    // Second call: Nominatim returns predictions.
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { lat: '48.85', lon: '2.35', display_name: 'Paris, Île-de-France, France' },
        { lat: '33.66', lon: '-95.55', display_name: 'Paris, Texas, USA' },
      ],
    })
    const r = await searchPlaces('paris')
    expect(r).toHaveLength(2)
    expect(r[0].mainText).toBe('Paris')
    expect(r[0].secondaryText).toBe('Île-de-France, France')
    expect(r[0].lat).toBeCloseTo(48.85, 2)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('returns [] when both proxy and Nominatim fail', async () => {
    global.fetch.mockRejectedValueOnce(new Error('proxy down'))
    global.fetch.mockRejectedValueOnce(new Error('nominatim down'))
    expect(await searchPlaces('foo')).toEqual([])
  })

  it('respects the limit option', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ fallback: true }) })
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        Array.from({ length: 10 }, (_, i) => ({
          lat: '0', lon: '0', display_name: `Place ${i}`,
        })),
    })
    const r = await searchPlaces('q', { limit: 3 })
    expect(r).toHaveLength(3)
  })
})
