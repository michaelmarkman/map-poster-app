// Single source of truth for geocoding in Vedute.
//
// Primary: the /api/places server proxy (Google Places API New) for
// autocomplete + place-details lookup. The proxy keeps the API key off
// the client bundle and groups requests under a session token for
// billing.
//
// Fallback: Nominatim (OpenStreetMap) for both forward geocoding and
// reverse geocoding. Used when (a) the proxy returns { fallback: true }
// (no key configured / quota / upstream error), or (b) the network call
// fails. The fallback is silent; callers see one prediction list shape
// either way.
//
// All helpers fail silently (return null / [] / never throw) so callers
// can fall back to coord-based naming or just skip the result.

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
// Tries the Places proxy first (autocomplete top result + resolve);
// falls back to Nominatim on { fallback: true }, non-2xx, or network
// failure. Callers that want a "did you mean" picker should use
// searchPlaces() + resolvePlace() directly to drive a real dropdown.
export async function geocodeSearch(query) {
  const trimmed = (query || '').trim()
  if (!trimmed) return null
  // Reuse searchPlaces so the proxy + fallback path stays single-source
  // of truth. Then resolve the top placeId — Nominatim predictions
  // already carry lat/lng inline, so no resolve call needed.
  const predictions = await searchPlaces(trimmed, { limit: 1 })
  const top = predictions?.[0]
  if (top) {
    if (Number.isFinite(top.lat) && Number.isFinite(top.lng)) {
      return {
        lat: top.lat,
        lng: top.lng,
        displayName: top.description || top.mainText || null,
      }
    }
    if (top.placeId) {
      const resolved = await resolvePlace(top.placeId)
      if (resolved) {
        return {
          lat: resolved.lat,
          lng: resolved.lng,
          displayName:
            top.description ||
            resolved.displayName ||
            resolved.formattedAddress ||
            null,
        }
      }
    }
  }
  // Last-ditch direct Nominatim fetch (in case searchPlaces both proxy
  // AND fallback returned nothing, which shouldn't happen but is cheap
  // insurance).
  try {
    const r = await fetchWithTimeout(
      `${NOMINATIM}/search?q=${encodeURIComponent(trimmed)}&format=json&limit=1`,
      { headers: { 'User-Agent': USER_AGENT } },
    )
    if (!r.ok) return null
    const results = await r.json()
    const row = results?.[0]
    if (!row) return null
    return {
      lat: +row.lat,
      lng: +row.lon,
      displayName: row.display_name || null,
    }
  } catch {
    return null
  }
}

// Mint a Places session token. Same string passes through every
// autocomplete request of one typing-stream and the matching
// resolvePlace() call so Google bills it as ONE session instead of
// N+1 individual charges. Callers manage the lifetime: create on
// first keystroke, reuse for all subsequent keystrokes, discard
// after a place is picked (or the popover closes without a pick).
export function newSessionToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

// Places autocomplete: query -> [{ description, placeId, mainText, secondaryText, lat?, lng? }].
// Hits the /api/places proxy first; on { fallback: true } / non-2xx /
// network error, falls back to Nominatim. Predictions from the proxy
// have a placeId (used by resolvePlace); Nominatim predictions carry
// lat/lng inline since they don't need a separate resolve step.
//
// Optional: pass `sessionToken` (one per typing session) and
// `bias: { lat, lng, radiusMeters }` to nudge results toward the
// active map view.
//
// Returns at most `limit` results (default 5). Empty array on any miss.
export async function searchPlaces(query, { limit = 5, sessionToken, bias } = {}) {
  const trimmed = (query || '').trim()
  if (!trimmed) return []
  try {
    const body = { q: trimmed, limit }
    if (sessionToken) body.sessionToken = sessionToken
    if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
      body.lat = bias.lat
      body.lng = bias.lng
      if (Number.isFinite(bias.radiusMeters)) body.radiusMeters = bias.radiusMeters
    }
    const r = await fetchWithTimeout('/api/places?action=autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
      if (Array.isArray(data?.predictions)) return [] // valid empty
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

// Resolve a Places-API placeId to coordinates + display info. Used after
// the user picks a prediction from the autocomplete dropdown. Pass the
// same sessionToken as the autocomplete calls so Google bundles the
// billing.
//
// Returns { lat, lng, displayName, formattedAddress } or null on miss.
//
// Predictions that already carry inline lat/lng (Nominatim fallback)
// don't need this — callers can use those directly.
export async function resolvePlace(placeId, { sessionToken } = {}) {
  if (!placeId || typeof placeId !== 'string') return null
  try {
    const body = { placeId }
    if (sessionToken) body.sessionToken = sessionToken
    const r = await fetchWithTimeout('/api/places?action=resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) return null
    const data = await r.json()
    if (!Number.isFinite(data?.lat) || !Number.isFinite(data?.lng)) return null
    return {
      lat: data.lat,
      lng: data.lng,
      displayName: data.displayName || null,
      formattedAddress: data.formattedAddress || null,
    }
  } catch {
    return null
  }
}

// Reverse geocode: lat/lng -> a short, human-friendly place label, or null
// on miss.
//
// Tries the Places proxy first (Google Geocoding API) — it picks the
// most specific landmark/neighborhood/locality available. Falls back
// to Nominatim on { fallback: true } / non-2xx / network failure;
// Nominatim's pick is the first available of neighbourhood → suburb →
// city_district → town → village → hamlet → city → first segment of
// display_name.
export async function reverseGeocodeName(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  // Proxy first.
  try {
    const r = await fetchWithTimeout('/api/places?action=reverse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng }),
    })
    if (r.ok) {
      const data = await r.json()
      // Empty (ZERO_RESULTS) is valid — fall through to Nominatim
      // which sometimes finds something Google misses (especially in
      // sparsely-mapped regions).
      if (data?.displayName) return data.displayName
    }
    // Non-2xx or empty → drop to Nominatim
  } catch {
    // network blip; fall through
  }
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
