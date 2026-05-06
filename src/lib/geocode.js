// Single source of truth for geocoding in Vedute. Today: Nominatim
// (OpenStreetMap). The plan in docs (§3.2) is to swap the implementation
// for Google Places later — keep all geocoding behind these two functions
// so that's a one-file change.
//
// Both helpers fail silently (return null / never throw) so callers can
// fall back to coord-based naming or just skip the result.

const USER_AGENT = 'Vedute/1.0'
const NOMINATIM = 'https://nominatim.openstreetmap.org'
// Network calls share a tight ceiling — geocoding is decorative
// (search a place, label a saved view), never load-bearing. A stalled
// request shouldn't keep the user staring at a frozen search input.
const FETCH_TIMEOUT_MS = 8000

function fetchWithTimeout(url, options = {}, ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timer)
  })
}

// Forward geocode: query string -> { lat, lng, displayName } or null.
//
// Returns the top result; callers wanting "did you mean..." disambiguation
// should query Nominatim directly until we move to a proper Places autocomplete.
export async function geocodeSearch(query) {
  const trimmed = (query || '').trim()
  if (!trimmed) return null
  try {
    const r = await fetchWithTimeout(
      `${NOMINATIM}/search?q=${encodeURIComponent(trimmed)}&format=json&limit=1`,
      { headers: { 'User-Agent': USER_AGENT } },
    )
    if (!r.ok) return null
    const results = await r.json()
    const top = results?.[0]
    if (!top) return null
    return {
      lat: +top.lat,
      lng: +top.lon,
      displayName: top.display_name || null,
    }
  } catch {
    return null
  }
}

// Places autocomplete: query string -> [{ description, placeId? }]. When
// `api/places.js` is wired up to Google Places, this hits the proxy first
// for autocomplete-quality predictions. Until then (or when the proxy is
// disabled / quota-blown), falls back to Nominatim's search endpoint, which
// returns enough variety to feel like predictions.
//
// Returns at most `limit` results (default 5). Empty array on any miss.
export async function searchPlaces(query, { limit = 5 } = {}) {
  const trimmed = (query || '').trim()
  if (!trimmed) return []
  // Try the server proxy first. If the proxy returns 501 / fallback:true,
  // we drop into the Nominatim path silently.
  try {
    const r = await fetchWithTimeout('/api/places', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: trimmed, limit }),
    })
    if (r.ok) {
      const data = await r.json()
      if (Array.isArray(data?.predictions) && data.predictions.length) {
        return data.predictions.slice(0, limit).map((p) => ({
          description: p.description || p.mainText || trimmed,
          placeId: p.placeId || null,
          mainText: p.mainText || null,
          secondaryText: p.secondaryText || null,
        }))
      }
    }
    // Non-2xx OR { fallback: true } -> drop through to Nominatim
  } catch {
    // network blip; fall through
  }
  try {
    const r = await fetchWithTimeout(
      `${NOMINATIM}/search?q=${encodeURIComponent(trimmed)}&format=json&limit=${limit}`,
      { headers: { 'User-Agent': USER_AGENT } },
    )
    if (!r.ok) return []
    const results = await r.json()
    if (!Array.isArray(results)) return []
    return results.slice(0, limit).map((row) => ({
      description: row.display_name || trimmed,
      placeId: null,
      mainText: typeof row.display_name === 'string' ? row.display_name.split(',')[0].trim() : null,
      secondaryText:
        typeof row.display_name === 'string'
          ? row.display_name.split(',').slice(1).join(',').trim()
          : null,
      lat: +row.lat,
      lng: +row.lon,
    }))
  } catch {
    return []
  }
}

// Reverse geocode: lat/lng -> a short, human-friendly place label, or null
// on miss. Picks the most specific neighbourhood-level segment available
// before falling back to the first comma-separated segment of display_name.
export async function reverseGeocodeName(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  try {
    const r = await fetchWithTimeout(
      `${NOMINATIM}/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14&addressdetails=1`,
      { headers: { 'User-Agent': USER_AGENT } },
    )
    if (!r.ok) return null
    const data = await r.json()
    const a = data?.address || {}
    return (
      a.neighbourhood || a.suburb || a.city_district ||
      a.town || a.village || a.hamlet || a.city ||
      (typeof data?.display_name === 'string' ? data.display_name.split(',')[0].trim() : null) ||
      null
    )
  } catch {
    return null
  }
}
