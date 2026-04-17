import { useEffect, useMemo, useState } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import SidebarSection from './SidebarSection'
import {
  timeOfDayAtom,
  latitudeAtom,
  longitudeAtom,
  sunRotationAtom,
  cloudsAtom,
  mapStyleAtom,
  todUnlockedAtom,
} from '../atoms/scene'
import { textFieldsAtom } from '../atoms/ui'
import { dispatchFlyTo } from '../scene/events'
import { getSunTimes } from '../utils/sun'

// localStorage key — matches prototype `poster-v3-ui.jsx:404`.
const TOD_UNLOCK_KEY = 'mapposter3d_tod_unlock'

// Map styles — mirrored from prototype `poster-v3-ui.jsx:3321-3331`. Labels
// and dot colours must line up with the static HTML grid; `filter` is applied
// as a CSS filter to `#canvas-container` by the Canvas section or globally
// once Phase 3D owns it. For now we just persist the key via mapStyleAtom and
// apply the filter here so the preview visually reacts.
const MAP_STYLES = {
  default:     { label: 'Default',    filter: 'none',                                                                          dot: '#8b9a7b' },
  satellite:   { label: 'Vivid',      filter: 'saturate(1.4) contrast(1.1)',                                                   dot: '#4a7a4a' },
  warm:        { label: 'Warm',       filter: 'sepia(0.15) saturate(1.2) brightness(1.05)',                                    dot: '#d4a24e' },
  cool:        { label: 'Cool',       filter: 'saturate(0.9) hue-rotate(15deg) brightness(1.02)',                              dot: '#5a8ab5' },
  desaturated: { label: 'Muted',      filter: 'saturate(0.4) brightness(1.05)',                                                dot: '#8a8a8a' },
  noir:        { label: 'Noir',       filter: 'grayscale(1) contrast(1.3) brightness(0.9)',                                    dot: '#333'    },
  sepia:       { label: 'Sepia',      filter: 'sepia(0.6) saturate(0.8) brightness(0.95)',                                     dot: '#a08060' },
  blueprint:   { label: 'Blueprint',  filter: 'grayscale(1) brightness(0.7) contrast(1.5) sepia(0.3) hue-rotate(190deg) saturate(2)', dot: '#2a5599' },
  neon:        { label: 'Neon',       filter: 'saturate(2) contrast(1.2) brightness(1.1)',                                     dot: '#e040e0' },
}

// Time-of-day formatter — verbatim from prototype `poster-v3-ui.jsx:858,885`.
const fmtHour = (h) => {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  const ap = hh >= 12 ? 'PM' : 'AM'
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
  return h12 + ':' + String(mm).padStart(2, '0') + ' ' + ap
}

// Compute the slider bounds given latitude + unlocked state. Mirrors
// `updateTodSliderRange` in the prototype.
function computeTodRange(lat, unlocked) {
  if (unlocked) return { min: 0, max: 24 }
  const { sunrise, sunset } = getSunTimes(lat)
  return { min: sunrise + 0.5, max: sunset - 0.5 }
}

export default function EnvironmentSection() {
  const [timeOfDay, setTimeOfDay] = useAtom(timeOfDayAtom)
  const [latitude, setLatitude] = useAtom(latitudeAtom)
  const [longitude, setLongitude] = useAtom(longitudeAtom)
  const [sunRotation, setSunRotation] = useAtom(sunRotationAtom)
  const [clouds, setClouds] = useAtom(cloudsAtom)
  const [mapStyle, setMapStyle] = useAtom(mapStyleAtom)
  const [todUnlocked, setTodUnlocked] = useAtom(todUnlockedAtom)
  const setTextFields = useSetAtom(textFieldsAtom)

  const [locationInput, setLocationInput] = useState('250 1st Ave, New York')
  const [mapStyleOpen, setMapStyleOpen] = useState(false)

  // Hydrate unlock flag + map style from localStorage on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(TOD_UNLOCK_KEY) === '1'
      if (stored !== todUnlocked) setTodUnlocked(stored)
    } catch (e) {}
    try {
      const storedStyle = localStorage.getItem('mapposter_map_style')
      if (storedStyle && MAP_STYLES[storedStyle]) setMapStyle(storedStyle)
    } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply map-style CSS filter to the canvas container whenever the atom
  // changes. Mirrors `poster-v3-ui.jsx:3348`.
  useEffect(() => {
    const el = document.getElementById('canvas-container')
    if (el) el.style.filter = (MAP_STYLES[mapStyle] || MAP_STYLES.default).filter
    try { localStorage.setItem('mapposter_map_style', mapStyle) } catch (e) {}
  }, [mapStyle])

  // Slider bounds — recomputed whenever latitude or unlock changes. When
  // unlock flips off and the current value is out of bounds we clamp it in
  // the same useEffect to match prototype behaviour.
  const todRange = useMemo(
    () => computeTodRange(latitude, todUnlocked),
    [latitude, todUnlocked]
  )
  useEffect(() => {
    if (timeOfDay < todRange.min) setTimeOfDay(todRange.min)
    else if (timeOfDay > todRange.max) setTimeOfDay(todRange.max)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todRange.min, todRange.max])

  // Location search — OSM Nominatim. Copied from prototype `poster-v3-ui.jsx:826-878`.
  const onLocationKeyDown = (e) => {
    if (e.key !== 'Enter') return
    const query = e.target.value.trim()
    if (!query) return

    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'MapPoster/1.0' } }
    )
      .then((r) => r.json())
      .then((results) => {
        if (!results?.length) { alert('Location not found'); return }
        const lat = +results[0].lat
        const lng = +results[0].lon
        const name = results[0].display_name
        setLocationInput(name)

        // Adjust time of day to the new longitude's local time
        const oldOffset = longitude / 15
        const newOffset = lng / 15
        const adjustedTime = timeOfDay + (newOffset - oldOffset)
        const wrappedTime = ((adjustedTime % 24) + 24) % 24

        setLatitude(lat)
        setLongitude(lng)

        // Clamp to the new latitude's sunrise/sunset unless unlocked
        const { sunrise, sunset } = getSunTimes(lat)
        const clamped = todUnlocked
          ? wrappedTime
          : Math.max(sunrise + 0.5, Math.min(sunset - 0.5, wrappedTime))
        setTimeOfDay(clamped)

        // Fly the R3F camera
        dispatchFlyTo({ lat, lng })

        // Update text overlay atom + legacy DOM fallbacks. Phase 4's
        // overlay component will listen for `location-changed` and update
        // directly from the event detail; updating the atom keeps Phase 3
        // consumers in sync.
        const shortName = name.split(',')[0]
        const coordStr =
          Math.abs(lat).toFixed(4) + '\u00b0 ' + (lat >= 0 ? 'N' : 'S') + ', ' +
          Math.abs(lng).toFixed(4) + '\u00b0 ' + (lng >= 0 ? 'E' : 'W')

        setTextFields((prev) => ({ ...prev, title: shortName, coords: coordStr }))

        // Legacy DOM handles — still in place for the prototype overlay until
        // Phase 4 lifts the overlay into React. Mirrors prototype lines 865-875.
        const titleEl = document.getElementById('text-title')
        const overlayTitle = document.getElementById('overlay-title')
        const coordsInput = document.getElementById('text-coords')
        const overlayCoords = document.getElementById('overlay-coords')
        if (titleEl) titleEl.value = shortName
        if (overlayTitle) overlayTitle.textContent = shortName
        if (coordsInput) coordsInput.value = coordStr
        if (overlayCoords) overlayCoords.textContent = coordStr

        // Emit an event so future React overlay can wire in.
        window.dispatchEvent(new CustomEvent('location-changed', {
          detail: { lat, lng, shortName, coordStr, fullName: name },
        }))
      })
      .catch(() => alert('Geocoding failed'))
  }

  // Skip ahead — nudge the cloud weather offset forward. The prototype's
  // +10 was far too aggressive (clouds jumped across the whole sky and
  // felt like a disorienting teleport). 0.3 is a recognizable "weather
  // just changed" shift without losing the current scene.
  const onSkipAhead = () => {
    const ref = window._cloudsRef
    if (ref && ref.localWeatherOffset) ref.localWeatherOffset.x += 0.3
  }

  const toggleUnlock = () => {
    const next = !todUnlocked
    setTodUnlocked(next)
    try { localStorage.setItem(TOD_UNLOCK_KEY, next ? '1' : '0') } catch (e) {}
  }

  const pickMapStyle = (key) => {
    if (!MAP_STYLES[key]) return
    setMapStyle(key)
  }

  const coveragePct = Math.round(clouds.coverage * 100)
  const currentStyle = MAP_STYLES[mapStyle] || MAP_STYLES.default

  return (
    <SidebarSection name="environment" title="Environment">
      <div className="search-field">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          className="text-input"
          id="location-search"
          placeholder="Search for a place..."
          value={locationInput}
          onChange={(e) => setLocationInput(e.target.value)}
          onKeyDown={onLocationKeyDown}
        />
      </div>

      <div className="control-row">
        <div className="control-label">
          <span>Time of day</span>
          <span className="control-value" id="tod-val">{fmtHour(timeOfDay)}</span>
        </div>
        <input
          type="range"
          id="tod-slider"
          min={todRange.min}
          max={todRange.max}
          step="0.25"
          value={timeOfDay}
          onChange={(e) => setTimeOfDay(+e.target.value)}
        />
      </div>

      <div className="control-row">
        <div className="control-label">
          <span>Sun rotation</span>
          <span className="control-value" id="sun-rot-val">{sunRotation}°</span>
        </div>
        <input
          type="range"
          id="sun-rot-slider"
          min="-180"
          max="180"
          step="1"
          value={sunRotation}
          onChange={(e) => setSunRotation(+e.target.value)}
        />
      </div>

      <div
        className="toggle-row"
        title="Allow the time of day slider to go below sunrise or above sunset (useful for polar scenes or stylized night renders)."
      >
        <span>Unlock time of day</span>
        <div
          className={todUnlocked ? 'toggle on' : 'toggle'}
          id="toggle-tod-unlock"
          onClick={toggleUnlock}
        />
      </div>

      <div className="toggle-row">
        <span>Clouds</span>
        <div
          className={clouds.on ? 'toggle on' : 'toggle'}
          id="toggle-clouds"
          onClick={() => setClouds({ ...clouds, on: !clouds.on })}
        />
      </div>

      <div className="indent">
        <div className="control-row">
          <div className="control-label">
            <span>Coverage</span>
            <span className="control-value" id="cloud-coverage-val">{coveragePct}%</span>
          </div>
          <input
            type="range"
            id="cloud-coverage-slider"
            min="0"
            max="100"
            step="1"
            value={coveragePct}
            onChange={(e) => setClouds({ ...clouds, coverage: +e.target.value / 100 })}
          />
        </div>

        <div className="control-row">
          <div className="control-label">
            <span>Speed</span>
            <span className="control-value" id="cloud-speed-val">{clouds.speed}x</span>
          </div>
          <input
            type="range"
            id="cloud-speed-slider"
            min="-10"
            max="10"
            step="0.5"
            value={clouds.speed}
            onChange={(e) => setClouds({ ...clouds, speed: +e.target.value })}
          />
        </div>

        <div className="toggle-row">
          <span>Cloud shadows</span>
          <div
            className={clouds.shadows ? 'toggle on' : 'toggle'}
            id="toggle-cloud-shadows"
            onClick={() => setClouds({ ...clouds, shadows: !clouds.shadows })}
          />
        </div>

        <div className="toggle-row">
          <span>Pause clouds</span>
          <div
            className={clouds.paused ? 'toggle on' : 'toggle'}
            id="toggle-cloud-pause"
            onClick={() => setClouds({ ...clouds, paused: !clouds.paused })}
          />
        </div>

        <button
          className="nav-row"
          id="cloud-skip-btn"
          style={{ padding: '8px 0' }}
          onClick={onSkipAhead}
          type="button"
        >
          <span>Skip ahead</span>
          <span className="chev">›</span>
        </button>
      </div>

      <button
        className={mapStyleOpen ? 'nav-row dropdown open' : 'nav-row dropdown'}
        id="open-map-style-btn"
        type="button"
        onClick={() => setMapStyleOpen((v) => !v)}
      >
        <span>Map style</span>
        <span className="right">
          <span id="map-style-label">{currentStyle.label}</span>
          <span className="chev dropdown-chev">›</span>
        </span>
      </button>

      <div
        className={mapStyleOpen ? 'dropdown-panel open' : 'dropdown-panel'}
        id="map-style-panel"
      >
        <div
          className="preset-grid"
          id="map-style-grid"
          style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
        >
          {Object.entries(MAP_STYLES).map(([key, s]) => (
            <button
              key={key}
              className={mapStyle === key ? 'ai-preset active' : 'ai-preset'}
              data-map-style={key}
              type="button"
              onClick={() => pickMapStyle(key)}
            >
              <span className="preset-dot" style={{ background: s.dot }} />
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </SidebarSection>
  )
}
