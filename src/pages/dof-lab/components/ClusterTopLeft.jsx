import { useEffect, useRef, useState } from 'react'
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import PopoverPill from './PopoverPill'
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
import { getSunTimes } from '../../editor/utils/sun'

function fire(name, detail) {
  window.dispatchEvent(detail !== undefined ? new CustomEvent(name, { detail }) : new Event(name))
}

function shorten(name) {
  return name.split(',').slice(0, 2).join(',').trim()
}

export default function ClusterTopLeft() {
  const setLatitude = useSetAtom(latitudeAtom)
  const [longitude, setLongitude] = useAtom(longitudeAtom)
  const [timeOfDay, setTimeOfDay] = useAtom(timeOfDayAtom)
  const todUnlocked = useAtomValue(todUnlockedAtom)
  const setTextFields = useSetAtom(textFieldsAtom)
  const savedViews = useAtomValue(savedViewsAtom)

  const [locationLabel, setLocationLabel] = useState('250 1st Ave, New York')
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    const onLocChange = (e) => {
      const name = e?.detail?.shortName || e?.detail?.fullName
      if (name) setLocationLabel(shorten(name))
    }
    window.addEventListener('location-changed', onLocChange)
    return () => window.removeEventListener('location-changed', onLocChange)
  }, [])

  const runSearch = async (q) => {
    const trimmed = q.trim()
    if (!trimmed) return
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&limit=1`,
        { headers: { 'User-Agent': 'MapPoster/1.0' } },
      )
      const results = await r.json()
      if (!results?.length) {
        alert('Location not found')
        return
      }
      const lat = +results[0].lat
      const lng = +results[0].lon
      const name = results[0].display_name
      setLocationLabel(shorten(name))
      const oldOffset = longitude / 15
      const newOffset = lng / 15
      const adjusted = ((timeOfDay + (newOffset - oldOffset)) % 24 + 24) % 24
      setLatitude(lat)
      setLongitude(lng)
      const { sunrise, sunset } = getSunTimes(lat)
      setTimeOfDay(todUnlocked ? adjusted : Math.max(sunrise + 0.5, Math.min(sunset - 0.5, adjusted)))
      dispatchFlyTo({ lat, lng })
      const shortName = name.split(',')[0]
      const coordStr =
        Math.abs(lat).toFixed(4) + '\u00b0 ' + (lat >= 0 ? 'N' : 'S') + ', ' +
        Math.abs(lng).toFixed(4) + '\u00b0 ' + (lng >= 0 ? 'E' : 'W')
      setTextFields((p) => ({ ...p, title: shortName, coords: coordStr }))
      window.dispatchEvent(
        new CustomEvent('location-changed', {
          detail: { lat, lng, shortName, coordStr, fullName: name },
        }),
      )
      setQuery('')
    } catch {
      alert('Geocoding failed')
    }
  }

  return (
    <div className="mock-cluster mock-cluster--top-left">
      <PopoverPill
        icon={<SearchIcon />}
        label=""
        align="left"
        panelClassName="mock-popover--search"
        aria-label={`Search location (current: ${locationLabel})`}
      >
        {({ close }) => (
          <input
            ref={inputRef}
            className="mock-input"
            type="text"
            placeholder="Search a place…"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                runSearch(query)
                close()
              } else if (e.key === 'Escape') {
                close()
              }
            }}
          />
        )}
      </PopoverPill>

      <PopoverPill
        icon={<PinIcon />}
        label={`Saved${savedViews.length ? ` · ${savedViews.length}` : ''}`}
        align="left"
        panelClassName="mock-popover--saved"
      >
        {({ close }) => (
          <div className="mock-saved-views">
            {savedViews.length === 0 ? (
              <div className="mock-empty">No saved views yet.</div>
            ) : (
              <ul className="mock-saved-list">
                {savedViews.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      className="mock-saved-row"
                      onClick={() => {
                        fire('load-view', v.id)
                        close()
                      }}
                    >
                      {v.name || 'Untitled view'}
                    </button>
                    <button
                      type="button"
                      className="mock-saved-del"
                      aria-label="Delete saved view"
                      onClick={(e) => {
                        e.stopPropagation()
                        fire('delete-view', v.id)
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="mock-btn-primary"
              onClick={() => {
                fire('save-view')
                close()
              }}
            >
              Save current view
            </button>
          </div>
        )}
      </PopoverPill>
    </div>
  )
}
