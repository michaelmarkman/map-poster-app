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
  // Honor an external signal too — when the caller's signal aborts
  // (e.g. user typed another character), abort our internal controller
  // so the underlying fetch winds down promptly.
  const externalSignal = options.signal
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }
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
// Per-session in-memory cache so repeated identical queries don't hit
// the network again. Nominatim is rate-limited (1 req/sec by their
// terms), so caching is the cheapest reliability win — typing "new yo"
// → "new yor" → "new yor" (typo backspace) returns cached on the
// repeat. Capped to keep memory bounded; LRU eviction by insertion
// order is sufficient at this scale.
const SEARCH_CACHE_LIMIT = 64
const searchCache = new Map() // cacheKey -> predictions[]
function cacheKeyFor(query, limit, bias) {
  const b = bias
    ? `|${bias.lat?.toFixed(2)},${bias.lng?.toFixed(2)},${bias.radiusMeters || 0}`
    : ''
  return `${query.toLowerCase()}|${limit}${b}`
}
function cacheRead(key) {
  if (!searchCache.has(key)) return null
  // Touch — re-insert so it's "newest" for LRU eviction.
  const v = searchCache.get(key)
  searchCache.delete(key)
  searchCache.set(key, v)
  return v
}
function cacheWrite(key, value) {
  if (searchCache.size >= SEARCH_CACHE_LIMIT) {
    // Evict oldest insertion.
    const oldest = searchCache.keys().next().value
    if (oldest) searchCache.delete(oldest)
  }
  searchCache.set(key, value)
}

export async function searchPlaces(
  query,
  { limit = 5, sessionToken, bias, signal } = {},
) {
  const trimmed = (query || '').trim()
  if (!trimmed) return []
  const key = cacheKeyFor(trimmed, limit, bias)
  const cached = cacheRead(key)
  if (cached) return cached
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
      signal,
    })
    if (r.ok) {
      const data = await r.json()
      // Proxy signals fallback when the key isn't configured / upstream
      // failed / Google returned an error. Drop through to Nominatim
      // instead of treating this as a real empty-result response.
      if (data?.fallback === true) {
        // intentional fall-through — do NOT cache, the next deploy
        // might wire Google up.
      } else if (Array.isArray(data?.predictions) && data.predictions.length) {
        const mapped = data.predictions.slice(0, limit).map((p) => ({
          description: p.description || p.mainText || trimmed,
          placeId: p.placeId || null,
          mainText: p.mainText || null,
          secondaryText: p.secondaryText || null,
        }))
        cacheWrite(key, mapped)
        return mapped
      } else if (Array.isArray(data?.predictions)) {
        cacheWrite(key, []) // valid empty — don't re-query
        return []
      }
    }
    // Non-2xx -> drop through to Nominatim
  } catch (e) {
    // Aborted by caller (new keystroke) — propagate so caller knows
    // to discard. Network blip / timeout — fall through to Nominatim.
    if (e?.name === 'AbortError') throw e
  }
  try {
    // dedupe=1 collapses near-duplicate hits (Manhattan as 3 separate
    // OSM nodes was filling the dropdown with the same name). Bias the
    // viewbox toward the current camera when provided so local hits
    // bubble up first — Nominatim sorts by name+importance but a
    // viewbox preference is honored as a soft signal.
    const params = new URLSearchParams({
      q: trimmed,
      format: 'json',
      limit: String(limit),
      dedupe: '1',
      'accept-language': 'en',
    })
    if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
      // ~25km box around the bias point — narrow enough to actually
      // matter, wide enough to still surface neighborhood hits.
      const radDeg = Math.max(0.1, (bias.radiusMeters || 25_000) / 111_000)
      const left = bias.lng - radDeg
      const right = bias.lng + radDeg
      const top = bias.lat + radDeg
      const bottom = bias.lat - radDeg
      params.set('viewbox', `${left},${top},${right},${bottom}`)
      params.set('bounded', '0') // soft bias, not a hard filter
    }
    const r = await fetchWithTimeout(
      `${NOMINATIM}/search?${params}`,
      { headers: { 'User-Agent': USER_AGENT }, signal },
    )
    if (!r.ok) {
      cacheWrite(key, [])
      return []
    }
    const results = await r.json()
    if (!Array.isArray(results)) {
      cacheWrite(key, [])
      return []
    }
    const mapped = results.slice(0, limit).map((row) => ({
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
    cacheWrite(key, mapped)
    return mapped
  } catch (e) {
    if (e?.name === 'AbortError') throw e
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
    // Proxy signals fallback — Google didn't fulfill this resolve. The
    // caller may have inline lat/lng from a Nominatim prediction; if
    // not, there's no resolve path so return null.
    if (data?.fallback === true) return null
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
  // reverseGeocodeRaw caches + handles the network — reuse it so the
  // Nominatim hit isn't fired twice when both naming and location
  // classification run together (saved-view auto-name flow).
  const raw = await reverseGeocodeRaw(lat, lng)
  if (!raw) return null
  const a = raw.address || {}
  // Prefer most-specific to least. amenity catches landmarks
  // (Brooklyn Bridge, Empire State Building); road catches a street
  // name when there's no named neighbourhood. suburb/city_district/
  // city are the broad fallbacks that produce the duplication
  // problem — they're last in the chain on purpose.
  return (
    a.amenity || a.building || a.tourism || a.shop ||
    a.neighbourhood || a.quarter ||
    a.road ||
    a.suburb || a.city_district ||
    a.town || a.village || a.hamlet || a.city ||
    (typeof raw.display_name === 'string' ? raw.display_name.split(',')[0].trim() : null) ||
    null
  )
}

// Per-session in-memory cache of full Nominatim reverse responses.
// Lat/lng rounded to a ~250m grid so small camera moves don't re-fire.
// Same LRU-by-insertion-order pattern as the searchCache above.
const REVERSE_CACHE_LIMIT = 64
const reverseCache = new Map()
function reverseCacheKey(lat, lng) {
  // 0.0025° lat ≈ 278m; lng grid is wider near the poles but the
  // editor's typical use is mid-latitude so this is fine.
  return `${lat.toFixed(4)},${lng.toFixed(4)}`
}

// Test-only: drop both caches so consecutive tests don't share state.
// Cheap to call (Map.clear is O(1) amortized) and ignored in prod
// since nothing in /app calls it.
export function __resetGeocodeCachesForTest() {
  searchCache.clear()
  reverseCache.clear()
}

// Return the full Nominatim reverse-geocode response (or null on miss).
// Used by:
//   - reverseGeocodeName() — picks a single display label from address tags
//   - locationContext.classifyLocation() — reads category/type/address
//     to decide urban-vs-nature
// Tries the /api/places proxy first (Google Geocoding), falls back to
// Nominatim. Nominatim's response shape is the documented one:
//   { place_id, lat, lon, category, type, addresstype, display_name,
//     address: { ... }, ... }
// The Google proxy returns a normalized subset (displayName, placeId,
// formattedAddress) so the classifier can only run when Nominatim
// answers — which is fine since Nominatim is the typical fallback.
export async function reverseGeocodeRaw(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const key = reverseCacheKey(lat, lng)
  if (reverseCache.has(key)) {
    const v = reverseCache.get(key)
    reverseCache.delete(key)
    reverseCache.set(key, v)
    return v
  }
  try {
    // zoom=18 gives building-level OSM tags. Same as the name path.
    const r = await fetchWithTimeout(
      `${NOMINATIM}/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
      { headers: { 'User-Agent': USER_AGENT } },
    )
    if (!r.ok) {
      reverseCache.set(key, null)
      return null
    }
    const data = await r.json()
    if (reverseCache.size >= REVERSE_CACHE_LIMIT) {
      const oldest = reverseCache.keys().next().value
      if (oldest) reverseCache.delete(oldest)
    }
    reverseCache.set(key, data)
    return data
  } catch {
    return null
  }
}

