import { useAtomValue } from 'jotai'
import { textOverlayAtom, textFieldsAtom } from '../atoms/ui'

// Georeferenced text labels rendered inside #canvas-container. Hidden when the
// overlay toggle is off (TextSection). Preserves the original IDs so the CSS
// in editor.css continues to style them without change.
export default function TextOverlay() {
  const visible = useAtomValue(textOverlayAtom)
  const fields = useAtomValue(textFieldsAtom)

  return (
    <div id="text-overlay" style={{ display: visible ? 'block' : 'none' }}>
      <div id="overlay-title">{fields.title}</div>
      <div id="overlay-subtitle">{fields.subtitle}</div>
      <div id="overlay-coords">{fields.coords}</div>
    </div>
  )
}
