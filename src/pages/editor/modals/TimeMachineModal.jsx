import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAtom } from 'jotai'
import { modalsAtom } from '../atoms/modals'

// Decades rendered by the Time Machine feature. Kept in sync with the
// prototype's DECADES constant (poster-v3-ui.jsx). The slider's min/max/step
// mirror these bounds.
const DECADES = [1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]

function nearestCompletedDecade(year, completed) {
  if (!completed.length) return null
  return completed.reduce((best, d) =>
    Math.abs(d - year) < Math.abs(best - year) ? d : best, completed[0])
}

// Phase 4 port of the imperative #tm-overlay from prototypes/poster-v3-ui.
// Producer-side logic (queueing R3F jobs, Gemini research, IndexedDB persistence)
// stays imperative in Phase 5 and feeds this component via window events.
export default function TimeMachineModal() {
  const [modals, setModals] = useAtom(modalsAtom)
  const open = modals.timeMachine

  // Per-decade payloads keyed by decade year → { dataUrl, blurb, location }.
  // Each event may carry any subset; we merge on arrival.
  const [decades, setDecades] = useState({})
  const [selected, setSelected] = useState(2020)
  const [blurbVisible, setBlurbVisible] = useState(true)
  const [status, setStatus] = useState('')
  const [firstSnapped, setFirstSnapped] = useState(false)

  const close = useCallback(() => {
    setModals(m => ({ ...m, timeMachine: false }))
  }, [setModals])

  // External trigger: other parts of the app dispatch 'open-time-machine' to
  // pop the modal.
  useEffect(() => {
    const onOpen = () => setModals(m => ({ ...m, timeMachine: true }))
    window.addEventListener('open-time-machine', onOpen)
    return () => window.removeEventListener('open-time-machine', onOpen)
  }, [setModals])

  // Reset local state whenever the modal transitions from closed to open so a
  // new session doesn't inherit the last run's images.
  useEffect(() => {
    if (open) {
      setDecades({})
      setSelected(2020)
      setBlurbVisible(true)
      setStatus('')
      setFirstSnapped(false)
    }
  }, [open])

  // Progress events carry { count, total }. We ignore count (we derive it from
  // our own decades dict) but keep the listener in case Phase 5 wants to force
  // a particular total display; for now we trust the payload's total.
  const [progressTotal, setProgressTotal] = useState(DECADES.length)
  useEffect(() => {
    const onProgress = (e) => {
      const total = e.detail?.total
      if (typeof total === 'number') setProgressTotal(total)
    }
    window.addEventListener('time-machine-progress', onProgress)
    return () => window.removeEventListener('time-machine-progress', onProgress)
  }, [])

  // Image/blurb/location event: merge the decade payload in.
  useEffect(() => {
    const onImage = (e) => {
      const { decade, dataUrl, blurb, location } = e.detail || {}
      if (decade == null) return
      setDecades(prev => {
        const next = { ...prev }
        const prevEntry = next[decade] || {}
        next[decade] = {
          dataUrl: dataUrl !== undefined ? dataUrl : prevEntry.dataUrl,
          blurb: blurb !== undefined ? blurb : prevEntry.blurb,
          location: location !== undefined ? location : prevEntry.location,
        }
        return next
      })
      // Mirror the prototype: snap the slider to the first decade that finishes
      // so the user sees something immediately.
      if (dataUrl) {
        setFirstSnapped(s => {
          if (!s) setSelected(decade)
          return true
        })
      }
    }
    window.addEventListener('time-machine-image', onImage)
    return () => window.removeEventListener('time-machine-image', onImage)
  }, [])

  useEffect(() => {
    const onStatus = (e) => {
      const text = typeof e.detail === 'string' ? e.detail : (e.detail?.text || '')
      setStatus(text || '')
    }
    window.addEventListener('time-machine-status', onStatus)
    return () => window.removeEventListener('time-machine-status', onStatus)
  }, [])

  // Esc closes the modal (only while open).
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // Derived values — what image to show, what blurb/location to pull for the
  // currently selected decade, etc.
  const completed = useMemo(
    () => DECADES.filter(d => decades[d]?.dataUrl),
    [decades],
  )
  const displayDecade = useMemo(() => {
    if (!completed.length) return null
    return decades[selected]?.dataUrl ? selected : nearestCompletedDecade(selected, completed)
  }, [completed, decades, selected])
  const displayImage = displayDecade != null ? decades[displayDecade]?.dataUrl : null

  // Research blurbs track the actual slider value (not the nearest completed),
  // so dragging smoothly updates the text even while images are still rendering.
  const currentBlurb = decades[selected]?.blurb || ''

  // Location is shared across decades — fall back to whichever decade has one.
  const currentLocation = useMemo(() => {
    if (decades[selected]?.location) return decades[selected].location
    for (const d of DECADES) {
      if (decades[d]?.location) return decades[d].location
    }
    return ''
  }, [decades, selected])

  const anyBlurbs = useMemo(
    () => DECADES.some(d => decades[d]?.blurb),
    [decades],
  )

  return (
    <div id="tm-overlay" className={open ? 'open' : ''}>
      <button id="tm-close" type="button" onClick={close}>×</button>
      <button
        id="tm-blurb-toggle"
        type="button"
        style={{ display: anyBlurbs ? 'block' : 'none' }}
        onClick={() => setBlurbVisible(v => !v)}
      >
        {blurbVisible ? 'hide notes' : 'show notes'}
      </button>
      <div
        id="tm-location"
        style={{ display: currentLocation ? 'block' : 'none' }}
      >
        {currentLocation}
      </div>
      <div id="tm-image-wrap">
        {displayImage && (
          <img
            id="tm-image"
            src={displayImage}
            style={{ display: 'block' }}
            alt=""
          />
        )}
        <div
          id="tm-empty"
          style={{ display: displayImage ? 'none' : 'block' }}
        >
          Rendering decades…
        </div>
      </div>
      <div id="tm-year-label">{selected ? `${selected}s` : '—'}</div>
      <div id="tm-slider-row">
        <span className="year">1900</span>
        <input
          id="tm-slider"
          type="range"
          min={1900}
          max={2020}
          step={10}
          value={selected}
          onChange={e => setSelected(+e.target.value)}
        />
        <span className="year">2020</span>
      </div>
      <div id="tm-progress">{completed.length} / {progressTotal} rendered</div>
      <div
        id="tm-blurb"
        style={{ display: (blurbVisible && currentBlurb) ? 'block' : 'none' }}
      >
        {currentBlurb}
      </div>
      <div
        id="tm-status"
        style={{ display: status ? 'block' : 'none' }}
      >
        {status}
      </div>
    </div>
  )
}
