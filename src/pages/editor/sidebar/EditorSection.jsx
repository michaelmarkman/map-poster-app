import SidebarSection from './SidebarSection'
import { IS_MOBILE } from '../atoms/scene'

// Graphic Editor sidebar entry. Buttons dispatch window events that
// prototypes/editor-overlay.jsx's `wireToolbar` / `wireTemplateUI`
// already listen for (by ID). The React DOM for the toolbar + props
// panel lives in graphics/GraphicEditorOverlay.jsx; initEditor finds
// the expected IDs there and attaches its listeners.
const BUILT_IN_TEMPLATES = ['City Name', 'Minimal', 'Vintage', 'Journal', 'Modern']

export default function EditorSection() {
  if (IS_MOBILE) {
    return (
      <SidebarSection name="editor" title="Graphic Editor">
        <div style={{ fontSize: 11, color: 'var(--ink-dim)', padding: '8px 4px', lineHeight: 1.5 }}>
          Graphic editor is only available on desktop.
        </div>
      </SidebarSection>
    )
  }

  return (
    <SidebarSection name="editor" title="Graphic Editor">
      <button
        className="btn"
        id="editor-toggle-btn"
        type="button"
        style={{
          width: '100%',
          background: 'var(--bg-2)',
          color: 'var(--ink-soft)',
          fontSize: 11,
          padding: 8,
          marginBottom: 8,
          border: '1px solid var(--panel-border)',
        }}
      >
        Open Editor
      </button>
      <div
        style={{
          fontSize: 9,
          color: 'var(--ink-dim)',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        TEMPLATES
      </div>
      <div className="ed-template-grid">
        {BUILT_IN_TEMPLATES.map((label, idx) => (
          <button key={idx} className="ed-template-btn" type="button" data-template={idx}>
            {label}
          </button>
        ))}
      </div>
      <div id="ed-custom-templates"></div>
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <button
          className="btn"
          id="ed-save-template"
          type="button"
          style={{
            flex: 1,
            background: 'var(--bg-2)',
            color: 'var(--ink-soft)',
            fontSize: 9,
            padding: 5,
            border: '1px solid var(--panel-border)',
          }}
        >
          Save as Template
        </button>
        <button
          className="btn"
          id="ed-clear-canvas"
          type="button"
          style={{
            flex: 1,
            background: 'var(--bg-2)',
            color: 'var(--ink-dim)',
            fontSize: 9,
            padding: 5,
            border: '1px solid var(--panel-border)',
          }}
        >
          Clear Overlay
        </button>
      </div>
    </SidebarSection>
  )
}
