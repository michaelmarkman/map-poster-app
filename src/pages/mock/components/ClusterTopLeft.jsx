import { useEffect, useRef, useState } from 'react'
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
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
import { geocodeSearch } from '../../../lib/geocode'

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
    const result = await geocodeSearch(trimmed)
    if (!result) {
      fireToast('error', 'Location not found')
      return
    }
    const { lat, lng, displayName: name } = result
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
        panelClassName="mock-popover--saved svp-panel"
      >
        {({ close }) => <SavedViewsPanel onClose={close} />}
      </PopoverPill>
    </div>
  )
}
