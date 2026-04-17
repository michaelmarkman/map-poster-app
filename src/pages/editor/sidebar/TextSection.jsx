import { useAtom } from 'jotai'
import SidebarSection from './SidebarSection'
import { textOverlayAtom, textFieldsAtom } from '../atoms/ui'

// Text / Graphic sidebar section — drives textOverlayAtom + textFieldsAtom.
// TextOverlay reads those atoms and renders the labels.
export default function TextSection() {
  const [overlayOn, setOverlayOn] = useAtom(textOverlayAtom)
  const [fields, setFields] = useAtom(textFieldsAtom)

  const updateField = (key) => (e) => {
    const value = e.target.value
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <SidebarSection name="text" title="Text / Graphic">
      <div className="toggle-row" style={{ marginBottom: 8 }}>
        <span>Show text</span>
        <div
          className={`toggle${overlayOn ? ' on' : ''}`}
          id="toggle-text-overlay"
          onClick={() => setOverlayOn(!overlayOn)}
        />
      </div>
      <input
        className="text-input"
        id="text-title"
        value={fields.title}
        placeholder="Title"
        onChange={updateField('title')}
      />
      <input
        className="text-input"
        id="text-subtitle"
        value={fields.subtitle}
        placeholder="Subtitle"
        onChange={updateField('subtitle')}
      />
      <input
        className="text-input"
        id="text-coords"
        value={fields.coords}
        placeholder="Coordinates"
        onChange={updateField('coords')}
      />
    </SidebarSection>
  )
}
