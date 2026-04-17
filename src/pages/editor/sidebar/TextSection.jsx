import { useAtom } from 'jotai'
import SidebarSection from './SidebarSection'
import { textOverlayAtom, textFieldsAtom } from '../atoms/ui'

// Text / Graphic sidebar section. Drives textOverlayAtom + textFieldsAtom,
// and also imperatively updates the prototype HTML overlay nodes so the
// pre-reactified canvas keeps rendering until Phase 4 ports the overlay.
export default function TextSection() {
  const [overlayOn, setOverlayOn] = useAtom(textOverlayAtom)
  const [fields, setFields] = useAtom(textFieldsAtom)

  const toggleOverlay = () => {
    const next = !overlayOn
    setOverlayOn(next)
    const overlay = document.getElementById('text-overlay')
    if (overlay) overlay.style.display = next ? 'block' : 'none'
  }

  const updateField = (key, domId) => (e) => {
    const value = e.target.value
    setFields((prev) => ({ ...prev, [key]: value }))
    const el = document.getElementById(domId)
    if (el) el.textContent = value
  }

  return (
    <SidebarSection name="text" title="Text / Graphic">
      <div className="toggle-row" style={{ marginBottom: 8 }}>
        <span>Show text</span>
        <div
          className={`toggle${overlayOn ? ' on' : ''}`}
          id="toggle-text-overlay"
          onClick={toggleOverlay}
        />
      </div>
      <input
        className="text-input"
        id="text-title"
        value={fields.title}
        placeholder="Title"
        onChange={updateField('title', 'overlay-title')}
      />
      <input
        className="text-input"
        id="text-subtitle"
        value={fields.subtitle}
        placeholder="Subtitle"
        onChange={updateField('subtitle', 'overlay-subtitle')}
      />
      <input
        className="text-input"
        id="text-coords"
        value={fields.coords}
        placeholder="Coordinates"
        onChange={updateField('coords', 'overlay-coords')}
      />
    </SidebarSection>
  )
}
