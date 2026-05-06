// Single source of truth for geocoding in Vedute. Today: Nominatim
// (OpenStreetMap). The plan in docs (§3.2) is to swap the implementation
// for Google Places later — keep all geocoding behind these two functions
// so that's a one-file change.
//
// Both helpers fail silently (return null / never throw) so callers can
// fall back to coord-based naming or just skip the result.

const USER_AGENT = 'Vedute/1.0'
const NOMINATIM = 'https://nominatim.openstreetmap.org'

// Forward geocode: query string -> { lat, lng, displayName } or null.
//
// Returns the top result; callers wanting "did you mean..." disambiguation
// should query Nominatim directly until we move to a proper Places autocomplete.
export async function geocodeSearch(query) {
  const trimmed = (query || '').trim()
  if (!trimmed) return null
  try {
    const r = await fetch(
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

// Reverse geocode: lat/lng -> a short, human-friendly place label, or null
// on miss. Picks the most specific neighbourhood-level segment available
// before falling back to the first comma-separated segment of display_name.
export async function reverseGeocodeName(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  try {
    const r = await fetch(
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
