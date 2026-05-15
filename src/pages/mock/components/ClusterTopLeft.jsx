import { useEffect, useRef, useState } from 'react'
import { useAtom, useSetAtom, useAtomValue, useStore } from 'jotai'
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
import { cameraReadoutAtom, textFieldsAtom } from '../../editor/atoms/ui'
import { savedViewsAtom } from '../../editor/atoms/sidebar'
import { dispatchFlyTo } from '../../editor/scene/events'
import { fireToast } from '../../../lib/toast'
import { getSunTimes } from '../../editor/utils/sun'
import {
  newSessionToken,
  resolvePlace,
  reverseGeocodeName,
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

  // Dynamic location label — subscribes to cameraReadoutAtom via the
  // jotai store and reverse-geocodes the camera's lat/lng when the
  // user has been still for ~700ms. NOT useAtomValue because the
  // readout updates at 5Hz — that would re-render the pill 5x/sec
  // (LEARNINGS 2026-04-17 pin). store.sub keeps subscription work
  // outside React.
  const store = useStore()
  const settleTimerRef = useRef(null)
  const lastGeocodedKeyRef = useRef(null)
  const queryRef = useRef('')           // mirror of `query` state for the sub callback
  const suppressUntilRef = useRef(0)    // timestamp; skip dynamic updates while < now

  useEffect(() => {
    const onLocChange = (e) => {
      const name = e?.detail?.shortName || e?.detail?.fullName
      if (name) setLocationLabel(shorten(name))
    }
    window.addEventListener('location-changed', onLocChange)
    return () => window.removeEventListener('location-changed', onLocChange)
  }, [])

  // Keep queryRef in lockstep with `query` so the store-sub callback
  // (which doesn't re-create across renders) always reads the latest.
  useEffect(() => { queryRef.current = query }, [query])

  // Dynamic location-label updater. Subscribes to cameraReadoutAtom
  // (which carries lat/lng at ~5Hz post-syncCameraToUI). For each new
  // readout, debounce 700ms — if the user lingers, reverse-geocode
  // the lat/lng and update the pill label with the most-specific tag
  // (neighbourhood / road / amenity). Skip while the user is typing
  // a search query or just picked a place (3s suppression window).
  // Skip when the cell hasn't changed since the last fire.
  useEffect(() => {
    const SETTLE_MS = 700
    // 4-decimal-degree cell (~11m) for dedup. The geocode lib's own
    // LRU cache snaps to ~278m, so most cell changes also hit cache.
    const cellKey = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`

    const handle = () => {
      if (queryRef.current) return
      if (Date.now() < suppressUntilRef.current) return
      const r = store.get(cameraReadoutAtom)
      if (!Number.isFinite(r?.latitude) || !Number.isFinite(r?.longitude)) return
      const key = cellKey(r.latitude, r.longitude)
      if (key === lastGeocodedKeyRef.current) return

      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
      settleTimerRef.current = setTimeout(async () => {
        // Re-check gates after the settle delay — user might have
        // started typing or moved further during the wait.
        if (queryRef.current) return
        if (Date.now() < suppressUntilRef.current) return
        const cur = store.get(cameraReadoutAtom)
        if (!Number.isFinite(cur?.latitude) || !Number.isFinite(cur?.longitude)) return
        const curKey = cellKey(cur.latitude, cur.longitude)
        lastGeocodedKeyRef.current = curKey
        const name = await reverseGeocodeName(cur.latitude, cur.longitude)
        if (!name) return
        // Re-check ONE more time post-async; user could have picked
        // something while the geocode was in flight.
        if (queryRef.current) return
        if (Date.now() < suppressUntilRef.current) return
        setLocationLabel(shorten(name))
      }, SETTLE_MS)
    }

    const unsub = store.sub(cameraReadoutAtom, handle)
    return () => {
      unsub()
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    }
  }, [store])

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
    // Suppress the dynamic camera-driven label for 3s — long enough
    // for the flyTo animation to settle. Without this, the
    // reverse-geocoder would overwrite the user's pick label with
    // whatever the most-specific tag at the destination resolves to
    // (often less precise than the Google Places display name).
    suppressUntilRef.current = Date.now() + 3000
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
