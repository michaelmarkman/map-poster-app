import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { locationContextAtom } from '../atoms/sidebar'
import { reverseGeocodeRaw } from '../../../lib/geocode'
import { classifyLocation } from '../../../lib/locationContext'

// Mounts a window-event listener that classifies the lat/lng under
// the camera and writes the result to locationContextAtom. Fires on:
//   - `location-changed` — search picks, preset flyTo, programmatic
//     restore (ClusterTopLeft dispatches this with {lat, lng} in
//     detail; useSavedViews also fires it after restore-view).
//
// reverseGeocodeRaw is cached + LRU-bounded so identical positions
// don't re-hit the network. The classifier is pure / synchronous.
//
// On classifier failure (null result) the atom is NOT cleared — the
// previous context is more useful than 'unknown'.
export default function useLocationContextSync() {
  const setContext = useSetAtom(locationContextAtom)

  useEffect(() => {
    let cancelled = false
    async function classify(lat, lng) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
      const raw = await reverseGeocodeRaw(lat, lng)
      if (cancelled) return
      const ctx = classifyLocation(raw)
      if (ctx) setContext(ctx)
    }
    const onLocChange = (e) => {
      const d = e?.detail
      if (!d) return
      classify(+d.lat, +d.lng)
    }
    window.addEventListener('location-changed', onLocChange)
    return () => {
      cancelled = true
      window.removeEventListener('location-changed', onLocChange)
    }
  }, [setContext])
}
