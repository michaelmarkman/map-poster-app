// Phase 3.2 stub. Real implementation: Google Places Autocomplete proxy.
//
// Why a server proxy? GOOGLE_PLACES_API_KEY can't ship in the client bundle —
// it would be visible in DevTools and abused. The proxy keeps the key on the
// server, lets us add session-based throttling (Places billing is per-session,
// not per-request, so we want sessions to be coarse), and gives us a single
// chokepoint for fallback to Nominatim if quota's blown.
//
// What this needs to do once the key is wired:
//
//   1. Read GOOGLE_PLACES_API_KEY from env (server-only).
//   2. Read `q` (query string) and `sessiontoken` from request body. The
//      sessiontoken should come from the client and be reused across the
//      keystrokes of one autocomplete session, then discarded — that's how
//      Places groups requests for billing.
//   3. Call the Places Autocomplete endpoint:
//        https://maps.googleapis.com/maps/api/place/autocomplete/json
//          ?input=<q>
//          &sessiontoken=<token>
//          &key=<env>
//      For places returning predictions, optionally call Place Details
//      with the place_id to resolve lat/lng — but only for the chosen
//      result (not every prediction), so we don't burn the per-session
//      Place Details charge on every keystroke.
//   4. Return { predictions: [{ placeId, description, mainText, secondaryText }] }.
//   5. On non-2xx from Google, return { fallback: true } and let the client
//      fall back to Nominatim (src/lib/geocode.js handles this — see
//      `searchPlaces`).
//
// Pricing reality check:
//   - Autocomplete (per session): $2.83 / 1000 sessions
//   - Place Details (per request): $17 / 1000 requests
//   We pay for Details only when the user picks a result — keep that
//   discipline server-side too.
//
// Returning 501 today so callers fall back to Nominatim (see
// src/lib/geocode.js → searchPlaces).

export default function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }
  res.statusCode = 501
  res.setHeader('Content-Type', 'application/json')
  res.end(
    JSON.stringify({
      error: 'places_not_configured',
      message:
        'Google Places API is not yet configured. Falling back to Nominatim. See api/places.js for the wire-up plan.',
      fallback: true,
    }),
  )
}
