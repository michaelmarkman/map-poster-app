// Location context classifier. Reads a Nominatim reverse-geocode
// response and returns 'urban' | 'nature' | 'mixed' for the lat/lng
// underneath the camera. Used to:
//   1. Pick the nature variant of an AI preset's prompt when the
//      scene is over a landscape (Realistic, Vedute, Travel Poster,
//      etc. have a `naturePrompt` field that reads better when
//      buildings aren't the subject).
//   2. Filter the modifier chip UI — `Cars` dims when over a forest,
//      `Wildlife` dims when over a city. Soft filter only; the user
//      can override.
//
// Pure: takes a raw Nominatim response object, returns a string.
// No network, no async. Data comes from `reverseGeocodeRaw()` in
// src/lib/geocode.js which handles the network + caching.

// Top-level Nominatim `category` values that read as nature.
const NATURE_CATEGORIES = new Set([
  'natural',      // peak, beach, water, wood, cliff, ridge, bay
  'leisure',      // park, nature_reserve, garden, common
  'waterway',     // river, stream, canal
  'water',
])

// Top-level Nominatim `category` values that read as urban.
const URBAN_CATEGORIES = new Set([
  'highway',      // primary, secondary, residential
  'building',     // any building tag
  'amenity',      // restaurant, school, hospital, pub, cafe
  'shop',
  'office',
  'commercial',
  'residential',
  'industrial',
])

// landuse subtype → nature when the type is one of these (otherwise
// landuse=commercial / residential / industrial are urban).
const NATURE_LANDUSE_TYPES = new Set([
  'forest', 'meadow', 'farmland', 'grass', 'orchard',
  'vineyard', 'nature_reserve', 'recreation_ground', 'allotments',
])

// Address tag keys that signal urban activity vs nature.
const URBAN_ADDRESS_KEYS = ['road', 'building', 'amenity', 'shop', 'suburb', 'neighbourhood', 'city_district', 'house_number']
const NATURE_ADDRESS_KEYS = ['natural', 'leisure', 'water', 'forest']

// Classify a Nominatim reverse-geocode response. Returns:
//   'urban'  — buildings + roads dominate (NYC, Tokyo, Paris)
//   'nature' — landscape dominates (Yosemite, Mt Fuji, Lake Tahoe)
//   'mixed'  — both signals present (Central Park, Hyde Park,
//               Lincoln Park) — keep urban prompt variants but show
//               nature modifiers as applicable
//   null     — couldn't decide (no response / no signals)
//
// Priority:
//   1. `category` in NATURE_CATEGORIES → nature
//   2. `category` === 'landuse' && type in NATURE_LANDUSE_TYPES → nature
//   3. `category` in URBAN_CATEGORIES → urban
//   4. Score address tags. natureCount > urbanCount → nature.
//      urbanCount > natureCount → urban. Both > 0 → mixed. Neither → null.
export function classifyLocation(raw) {
  if (!raw || typeof raw !== 'object') return null
  const cat = raw.category
  const type = raw.type
  if (cat && NATURE_CATEGORIES.has(cat)) return 'nature'
  if (cat === 'landuse' && NATURE_LANDUSE_TYPES.has(type)) return 'nature'
  if (cat && URBAN_CATEGORIES.has(cat)) return 'urban'

  const a = raw.address || {}
  let urbanCount = 0
  let natureCount = 0
  for (const k of URBAN_ADDRESS_KEYS) if (a[k]) urbanCount++
  for (const k of NATURE_ADDRESS_KEYS) if (a[k]) natureCount++

  if (natureCount > 0 && urbanCount > 0) return 'mixed'
  if (natureCount > urbanCount) return 'nature'
  if (urbanCount > natureCount) return 'urban'
  // Both zero — no usable signal.
  return null
}
