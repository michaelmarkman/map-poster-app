// Server-side proxy for Google Places API (New) — autocomplete predictions
// + place-details resolution. Keeps the API key off the client bundle and
// gives us a single chokepoint for fallback to Nominatim if quota/auth
// fails.
//
// Three actions distinguished by `?action=`:
//
//   POST /api/places?action=autocomplete  body: { q, sessionToken? }
//     → { predictions: [{ placeId, description, mainText, secondaryText }] }
//
//   POST /api/places?action=resolve       body: { placeId, sessionToken? }
//     → { placeId, lat, lng, displayName, formattedAddress }
//
//   POST /api/places?action=reverse       body: { lat, lng }
//     → { displayName, formattedAddress, placeId? }
//     Uses the Geocoding API (NOT Places API) since Places (New)'s
//     reverse-by-coords endpoint requires a Place type filter that
//     drops most of the useful neighborhood/locality results.
//
// On auth/quota failure either action returns `{ fallback: true }` with
// non-2xx so the client (src/lib/geocode.js) drops to Nominatim instead
// of failing loudly.
//
// Session tokens: Places API (New) bills one "session" per autocomplete-
// typing-stream + one place-details call. The client passes `sessionToken`
// on each autocomplete request and the matching `resolvePlace` so Google
// groups them. Server forwards the token unchanged.
//
// Pricing reality check (2026 prices, monitor):
//   - Places Autocomplete (New): $2.83/1000 sessions
//   - Place Details (New, w/ session): bundled with the autocomplete
//     session as long as the same sessionToken is passed
//
// Auth: reads GOOGLE_PLACES_API_KEY first, then falls back to
// VITE_GOOGLE_3DTILES_KEY (since Vedute typically uses the same key for
// 3D Tiles + Places — both are restricted to the same project).

const WINDOW_MS = 60 * 1000
const MAX_PER_WINDOW = 60 // generous; Places throttling itself is the real limit
const rateBuckets = new Map()

const PLACES_AUTOCOMPLETE = 'https://places.googleapis.com/v1/places:autocomplete'
const PLACES_DETAILS_BASE = 'https://places.googleapis.com/v1/places/'
const GEOCODING_BASE = 'https://maps.googleapis.com/maps/api/geocode/json'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body
  }
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  try { return JSON.parse(raw) } catch { return {} }
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) ||
         req.socket?.remoteAddress || 'unknown'
}

function rateLimited(ip) {
  const now = Date.now()
  const hits = (rateBuckets.get(ip) || []).filter(t => now - t < WINDOW_MS)
  if (hits.length >= MAX_PER_WINDOW) return true
  hits.push(now)
  rateBuckets.set(ip, hits)
  return false
}

function jsonResponse(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function getApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY ||
         process.env.VITE_GOOGLE_3DTILES_KEY ||
         ''
}

// Reshape Places API (New) suggestions into the prediction shape src/lib/
// geocode.js expects. We only surface placePredictions — the user wants
// to fly to a coordinate, not a generic search-term.
function shapePredictions(suggestions) {
  if (!Array.isArray(suggestions)) return []
  const out = []
  for (const s of suggestions) {
    const pp = s?.placePrediction
    if (!pp?.placeId) continue
    out.push({
      placeId: pp.placeId,
      description: pp.text?.text || '',
      mainText: pp.structuredFormat?.mainText?.text || pp.text?.text || '',
      secondaryText: pp.structuredFormat?.secondaryText?.text || '',
    })
  }
  return out
}

async function autocomplete(req, res) {
  const key = getApiKey()
  if (!key) {
    // Return 200 + fallback flag (not 501) — the browser flags any
    // non-2xx as a console error even when the client is set up to
    // handle it gracefully. Client checks `data.fallback === true`
    // and falls through to Nominatim. Clean network panel.
    return jsonResponse(res, 200, {
      predictions: [],
      fallback: true,
      reason: 'places_not_configured',
    })
  }
  const body = await readJsonBody(req)
  const q = typeof body?.q === 'string' ? body.q.trim() : ''
  if (!q) return jsonResponse(res, 400, { error: 'missing_query', predictions: [] })

  const payload = { input: q }
  if (typeof body.sessionToken === 'string' && body.sessionToken) {
    payload.sessionToken = body.sessionToken
  }
  // Optional location bias: the client can pass { lat, lng, radiusMeters }
  // to nudge Places toward the active map view ("Park" → Yoyogi when the
  // camera's over Tokyo).
  if (Number.isFinite(body?.lat) && Number.isFinite(body?.lng)) {
    payload.locationBias = {
      circle: {
        center: { latitude: body.lat, longitude: body.lng },
        radius: Math.max(1, Math.min(50_000, +body.radiusMeters || 5000)),
      },
    }
  }

  try {
    const upstream = await fetch(PLACES_AUTOCOMPLETE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
      },
      body: JSON.stringify(payload),
    })
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '')
      // Same rationale as the no-key branch above: return 200 with
      // fallback flag so the browser doesn't flag the response red.
      // The upstream status/detail still rides along in the body for
      // server-log debugging.
      return jsonResponse(res, 200, {
        predictions: [],
        fallback: true,
        reason: 'places_upstream_error',
        status: upstream.status,
        detail: detail.slice(0, 240),
      })
    }
    const data = await upstream.json()
    return jsonResponse(res, 200, {
      predictions: shapePredictions(data?.suggestions),
    })
  } catch (e) {
    return jsonResponse(res, 200, {
      predictions: [],
      fallback: true,
      reason: 'places_network_error',
      detail: String(e?.message || e),
    })
  }
}

async function resolve(req, res) {
  const key = getApiKey()
  if (!key) {
    return jsonResponse(res, 200, {
      fallback: true,
      reason: 'places_not_configured',
    })
  }
  const body = await readJsonBody(req)
  const placeId = typeof body?.placeId === 'string' ? body.placeId : ''
  // Place IDs are alphanumerics + - and _; reject anything else outright.
  if (!placeId || !/^[A-Za-z0-9_-]+$/.test(placeId)) {
    return jsonResponse(res, 400, { error: 'invalid_place_id' })
  }

  const url = new URL(PLACES_DETAILS_BASE + encodeURIComponent(placeId))
  if (typeof body.sessionToken === 'string' && body.sessionToken) {
    url.searchParams.set('sessionToken', body.sessionToken)
  }

  try {
    const upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': key,
        // Field mask is REQUIRED by Places (New). Asking for the
        // minimum we need keeps the billing tier at "Essentials".
        'X-Goog-FieldMask': 'id,location,displayName,formattedAddress',
      },
    })
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '')
      return jsonResponse(res, 200, {
        fallback: true,
        reason: 'places_upstream_error',
        status: upstream.status,
        detail: detail.slice(0, 240),
      })
    }
    const data = await upstream.json()
    const lat = data?.location?.latitude
    const lng = data?.location?.longitude
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return jsonResponse(res, 200, {
        fallback: true,
        reason: 'places_no_location',
      })
    }
    return jsonResponse(res, 200, {
      placeId: data?.id || placeId,
      lat,
      lng,
      displayName: data?.displayName?.text || null,
      formattedAddress: data?.formattedAddress || null,
    })
  } catch (e) {
    return jsonResponse(res, 200, {
      fallback: true,
      reason: 'places_network_error',
      detail: String(e?.message || e),
    })
  }
}

// Pick the most user-friendly name from a Geocoding API result list.
// Geocoding returns a stack of address-component-grained results; we
// prefer specific landmarks → neighborhood → locality → administrative
// area, falling back to the formatted_address of the top result.
//
// Result shape (one of many): { types: [...], formatted_address, address_components: [...], place_id }
//
// "types" rank from most-specific to least:
//   point_of_interest / establishment / premise → a named landmark
//   neighborhood / sublocality_level_1          → "Midtown", "East Village"
//   locality                                     → "New York"
//   administrative_area_level_1                  → "New York" (the state)
//   country                                      → last-ditch fallback
function pickBestName(results) {
  if (!Array.isArray(results) || !results.length) return null
  const rankOrder = [
    ['point_of_interest', 'establishment', 'premise'],
    ['neighborhood'],
    ['sublocality_level_1', 'sublocality'],
    ['locality'],
    ['administrative_area_level_2'],
    ['administrative_area_level_1'],
    ['country'],
  ]
  for (const tier of rankOrder) {
    for (const r of results) {
      if (!Array.isArray(r?.types)) continue
      if (tier.some((t) => r.types.includes(t))) {
        // The address_components has the friendly name; formatted_address
        // is the full address. Prefer the long_name of the matching
        // component when we can find it; fall back to the first segment
        // of formatted_address.
        const comp = r.address_components?.find((c) =>
          tier.some((t) => c.types?.includes(t)),
        )
        const name = comp?.long_name || r.formatted_address?.split(',')[0]?.trim()
        if (name) return { displayName: name, formattedAddress: r.formatted_address || null, placeId: r.place_id || null }
      }
    }
  }
  // Nothing matched the rank. Best effort: top result's first segment.
  const top = results[0]
  const name = top?.formatted_address?.split(',')[0]?.trim()
  return name ? { displayName: name, formattedAddress: top.formatted_address || null, placeId: top.place_id || null } : null
}

async function reverse(req, res) {
  const key = getApiKey()
  if (!key) {
    return jsonResponse(res, 200, {
      fallback: true,
      reason: 'places_not_configured',
    })
  }
  const body = await readJsonBody(req)
  const lat = +body?.lat
  const lng = +body?.lng
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return jsonResponse(res, 400, { error: 'invalid_coords' })
  }

  // Geocoding API GET. The lat/lng pair is appended to the query as a
  // single `latlng=` param (Google's documented format).
  const url = `${GEOCODING_BASE}?latlng=${encodeURIComponent(`${lat},${lng}`)}&key=${encodeURIComponent(key)}`
  try {
    const upstream = await fetch(url)
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '')
      return jsonResponse(res, 200, {
        fallback: true,
        reason: 'places_upstream_error',
        status: upstream.status,
        detail: detail.slice(0, 240),
      })
    }
    const data = await upstream.json()
    if (data?.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return jsonResponse(res, 200, {
        fallback: true,
        reason: 'geocoding_status_' + data.status,
        detail: (data.error_message || '').slice(0, 240),
      })
    }
    const picked = pickBestName(data?.results)
    if (!picked) {
      return jsonResponse(res, 200, {
        displayName: null,
        formattedAddress: null,
        placeId: null,
      })
    }
    return jsonResponse(res, 200, picked)
  } catch (e) {
    return jsonResponse(res, 200, {
      fallback: true,
      reason: 'places_network_error',
      detail: String(e?.message || e),
    })
  }
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }
  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'method_not_allowed' })
  }
  if (rateLimited(clientIp(req))) {
    return jsonResponse(res, 429, { error: 'rate_limit', fallback: true })
  }
  const url = new URL(req.url, 'http://localhost')
  const action = url.searchParams.get('action') || 'autocomplete'
  if (action === 'autocomplete') return autocomplete(req, res)
  if (action === 'resolve') return resolve(req, res)
  if (action === 'reverse') return reverse(req, res)
  return jsonResponse(res, 400, { error: 'unknown_action' })
}
