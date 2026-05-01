import { useAtomValue } from 'jotai'
import { savedViewsAtom, savedViewMarkersOnAtom } from '../atoms/sidebar'

// Renders a 3D camera marker per saved view. Mounted unconditionally inside
// <Scene> — returns null when the toggle is off so there's zero per-frame
// cost while disabled. See docs/superpowers/specs/2026-04-30-saved-view-
// camera-markers-design.md.
export default function SavedViewMarkers() {
  const on = useAtomValue(savedViewMarkersOnAtom)
  const views = useAtomValue(savedViewsAtom)
  if (!on) return null
  if (!views?.length) return null
  // TODO(next task): per-marker rendering.
  return null
}
