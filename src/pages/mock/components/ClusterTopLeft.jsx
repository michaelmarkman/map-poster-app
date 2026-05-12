import { useEffect, useRef, useState } from 'react'
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import AccountChip from './AccountChip'
import PopoverPill from './PopoverPill'
import SavedViewsPanel from './SavedViewsPanel'
import { SearchIcon, PinIcon } from './icons'
import {
  latitudeAtom,
  longitudeAtom,
  timeOfDayAtom,
  todUnlockedAtom,
} from '../../editor/atoms/scene'
import { textFieldsAtom } from '../../editor/atoms/ui'
import { savedViewsAtom } from '../../editor/atoms/sidebar'
import { dispatchFlyTo } from '../../editor/scene/events'
import { fireToast } from '../../../lib/toast'
import { getSunTimes } from '../../editor/utils/sun'
import {
  newSessionToken,
  resolvePlace,
  searchPlaces,
} from '../../../lib/geocode'

function shorten(name) {
  if (!name) return ''
  return name.split(',').slice(0, 2).join(',').trim()
}

// Debounce keystrokes -> autocomplete fetches. Tuned to balance feel
// (responsive) against Nominatim's 1 req/sec rate limit (the prod
// fallback when no Google key is set). At 220ms a user typing 5
// chars/sec only sends a request on natural pauses, not on every key —
// and we cancel any in-flight request when a new key arrives so old
// results can't overwrite newer ones.
const TYPE_DEBOUNCE_MS = 220

export default function ClusterTopLeft() {
  const setLatitude = useSetAtom(latitudeAtom)
  const [longitude, setLongitude] = useAtom(longitudeAtom)
  const [latitudeForBias] = useAtom(latitudeAtom)
  const [timeOfDay, setTimeOfDay] = useAtom(timeOfDayAtom)
  const todUnlocked = useAtomValue(todUnlockedAtom)
  const setTextFields = useSetAtom(textFieldsAtom)
  const savedViews = useAtomValue(savedViewsAtom)

  const [locationLabel, setLocationLabel] = useState('250 1st Ave, New York')
  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState([])
  const [highlight, setHighlight] = useState(0)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)
  // In-flight abort controller — every new keystroke cancels the
  // previous request so the latest query always wins the race for
  // setPredictions. Without this, slow responses to short prefixes
  // could overwrite fast responses to longer ones.
  const abortRef = useRef(null)
  // Session token: minted on the first keystroke of a typing-stream so
  // every autocomplete + the matching resolve is billed as ONE Places
  // session. Cleared on commit (success / Escape / popover close).
  const sessionTokenRef = useRef(null)

  useEffect(() => {
    const onLocChange = (e) => {
      const name = e?.detail?.shortName || e?.detail?.fullName
      if (name) setLocationLabel(shorten(name))
    }
    window.addEventListener('location-changed', onLocChange)
    return () => window.removeEventListener('location-changed', onLocChange)
  }, [])

  const ensureSession = () => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = newSessionToken()
    }
    return sessionTokenRef.current
  }

  const clearSession = () => {
    sessionTokenRef.current = null
  }

  // Run autocomplete for the current query (debounced via the caller).
  // Cancels any in-flight request — searchPlaces propagates AbortError
  // for caller-initiated aborts so we can drop stale results.
  const runAutocomplete = async (q) => {
    const trimmed = q.trim()
    if (abortRef.current) abortRef.current.abort()
    if (!trimmed) {
      setPredictions([])
      setSearching(false)
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setSearching(true)
    try {
      const results = await searchPlaces(trimmed, {
        limit: 6,
        sessionToken: ensureSession(),
        bias: { lat: latitudeForBias, lng: longitude, radiusMeters: 25_000 },
        signal: controller.signal,
      })
      // Guard against a stale response landing after the user typed
      // more — only apply when this controller is still the current one.
      if (abortRef.current === controller) {
        setPredictions(results)
        setHighlight(0)
      }
    } catch (e) {
      if (e?.name !== 'AbortError') {
        // Network failure with no fallback result — clear predictions
        // so the user sees the empty state, not stale predictions.
        if (abortRef.current === controller) setPredictions([])
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setSearching(false)
      }
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runAutocomplete(query), TYPE_DEBOUNCE_MS)
    return () => {
      clearTimeout(debounceRef.current)
      // Cancel any in-flight request when the component unmounts or
      // the query effect re-fires; prevents a setState-after-unmount
      // from a slow Nominatim response.
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
    }
    // runAutocomplete deliberately not in deps — it captures fresh state
    // each render anyway, and including it would refire on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // Apply a picked prediction: resolve to coords (Google) or use inline
  // coords (Nominatim fallback), then fly the camera + update sun + text.
  const applyPrediction = async (p) => {
    if (!p) return
    let lat, lng, name
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
      // Nominatim path — coords already inline.
      lat = p.lat
      lng = p.lng
      name = p.description || p.mainText || ''
    } else if (p.placeId) {
      // Google path — resolve via /api/places?action=resolve.
      const resolved = await resolvePlace(p.placeId, {
        sessionToken: sessionTokenRef.current,
      })
      if (!resolved) {
        fireToast('error', 'Could not resolve that place')
        return
      }
      lat = resolved.lat
      lng = resolved.lng
      name = p.description || resolved.displayName || resolved.formattedAddress || ''
    } else {
      fireToast('error', 'Place has no resolvable location')
      return
    }
    clearSession()
    setLocationLabel(shorten(name))
    const oldOffset = longitude / 15
    const newOffset = lng / 15
    const adjusted = ((timeOfDay + (newOffset - oldOffset)) % 24 + 24) % 24
    setLatitude(lat)
    setLongitude(lng)
    const { sunrise, sunset } = getSunTimes(lat)
    setTimeOfDay(
      todUnlocked
        ? adjusted
        : Math.max(sunrise + 0.5, Math.min(sunset - 0.5, adjusted)),
    )
    dispatchFlyTo({ lat, lng })
    const shortName = name.split(',')[0].trim()
    const coordStr =
      Math.abs(lat).toFixed(4) + '° ' + (lat >= 0 ? 'N' : 'S') + ', ' +
      Math.abs(lng).toFixed(4) + '° ' + (lng >= 0 ? 'E' : 'W')
    setTextFields((prev) => ({ ...prev, title: shortName, coords: coordStr }))
    window.dispatchEvent(
      new CustomEvent('location-changed', {
        detail: { lat, lng, shortName, coordStr, fullName: name },
      }),
    )
    setQuery('')
    setPredictions([])
  }

  // Pressing Enter with predictions visible commits the highlighted one.
  // Pressing Enter with no predictions just hits the search shortcut on
  // the raw query string (forward-geocode top result via the same proxy).
  const onKeyDown = (e, close) => {
    if (e.key === 'Escape') {
      clearSession()
      close()
      return
    }
    if (e.key === 'ArrowDown' && predictions.length) {
      e.preventDefault()
      setHighlight((i) => Math.min(predictions.length - 1, i + 1))
      return
    }
    if (e.key === 'ArrowUp' && predictions.length) {
      e.preventDefault()
      setHighlight((i) => Math.max(0, i - 1))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const trimmed = query.trim()
      if (!trimmed) return
      const pick = predictions[highlight] || predictions[0]
      if (pick) {
        applyPrediction(pick).then(() => close())
        return
      }
      // No predictions yet (offline / fallback empty) — nothing to commit.
      fireToast('error', 'Location not found')
    }
  }

  return (
    <div className="mock-cluster mock-cluster--top-left">
      {/* Prototype order: search FIRST (value-only pill — icon + the
       *  current location string), Views SECOND (two-slot
       *  LABEL VALUE). AccountChip stays at the end as the product
       *  affordance the prototype doesn't model. */}
      <PopoverPill
        icon={<SearchIcon />}
        value={locationLabel}
        align="left"
        panelClassName="mock-popover--search"
        className="mock-pill--search"
        aria-label={`Search location (current: ${locationLabel})`}
      >
        {({ close }) => (
          <div className="mock-search-wrap">
            {/* Phase 16 — input row with leading magnifier icon, matches
             *  the prototype's `.menu-search-input` recipe. */}
            <div className="mock-search-input-row">
              <svg
                className="mock-search-input-icon"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <circle cx="5" cy="5" r="3.25" />
                <path d="M7.3 7.3 10 10" />
              </svg>
              <input
                ref={inputRef}
                className="mock-search-input"
                type="text"
                placeholder="Search a location…"
                value={query}
                autoFocus
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={predictions.length > 0}
                aria-controls="mock-search-listbox"
                aria-activedescendant={
                  predictions[highlight] ? `mock-pred-${highlight}` : undefined
                }
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => onKeyDown(e, close)}
              />
            </div>
            {predictions.length > 0 && (
              <ul
                id="mock-search-listbox"
                role="listbox"
                className="mock-search-predictions"
              >
                {predictions.map((p, i) => (
                  <li
                    key={p.placeId || `${p.description}-${i}`}
                    id={`mock-pred-${i}`}
                    role="option"
                    aria-selected={i === highlight}
                    className={`mock-search-prediction${i === highlight ? ' is-active' : ''}`}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => {
                      // Use mousedown so we beat the input's blur (which
                      // would close the popover before the click registers).
                      e.preventDefault()
                      applyPrediction(p).then(() => close())
                    }}
                  >
                    <span className="mock-search-prediction-main">
                      {p.mainText || p.description}
                    </span>
                    {p.secondaryText ? (
                      <span className="mock-search-prediction-secondary">
                        {p.secondaryText}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {!predictions.length && query.trim() && !searching && (
              <div className="mock-search-empty">No matches</div>
            )}
          </div>
        )}
      </PopoverPill>

      <PopoverPill
        icon={<PinIcon />}
        label="Views"
        value={savedViews.length || 0}
        align="left"
        panelClassName="mock-popover--saved svp-panel"
      >
        {({ close }) => <SavedViewsPanel onClose={close} />}
      </PopoverPill>

      <AccountChip />
    </div>
  )
}
