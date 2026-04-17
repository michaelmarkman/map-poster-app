// Date + sun helpers extracted from the prototype Scene.
// Pure math — no R3F, no atoms. Consumers pass raw state values in.

// getDateFromHour: convert a local time-of-day (0-24) + longitude into a UTC
// Date that the atmosphere shader uses to compute sun direction. We keep the
// date fixed to "today" at the chosen hour so the scene matches current
// sun arc for the latitude.
export function getDateFromHour(hour, longitude) {
  const year = new Date().getFullYear()
  const dayOfYear = Math.floor((Date.now() - Date.UTC(year, 0, 1)) / 86400000) + 1
  const epoch = Date.UTC(year, 0, 1)
  const offset = longitude / 15
  return new Date(epoch + (dayOfYear * 24 + hour - offset) * 3600000)
}

// Approximate sunrise/sunset for a given latitude (civil twilight, ~6° below
// horizon). Returns { sunrise, sunset } in decimal hours (local solar time).
// Used by the ToD slider range logic so users can't pick a "night" hour that
// would produce an unlit render — unless they explicitly unlock the range.
export function getSunTimes(lat) {
  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getFullYear(), 0, 1)) / 86400000) + 1
  // Solar declination (approximate)
  const decl = 23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81))
  const declRad = decl * Math.PI / 180
  const latRad = lat * Math.PI / 180
  // Hour angle for civil twilight (-6°)
  const zenith = (90 + 6) * Math.PI / 180
  const cosH = (Math.cos(zenith) - Math.sin(latRad) * Math.sin(declRad)) / (Math.cos(latRad) * Math.cos(declRad))
  if (cosH > 1) return { sunrise: 6, sunset: 18 } // sun never rises (polar night)
  if (cosH < -1) return { sunrise: 0, sunset: 24 } // midnight sun
  const H = Math.acos(cosH) * 180 / Math.PI / 15 // hours
  const sunrise = Math.max(0, Math.round((12 - H) * 4) / 4) // round to 15min
  const sunset = Math.min(24, Math.round((12 + H) * 4) / 4)
  return { sunrise, sunset }
}
