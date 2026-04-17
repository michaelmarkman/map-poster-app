import SidebarSection from './SidebarSection'
import { IS_MOBILE } from '../atoms/scene'

// Graphic Editor sidebar section — desktop only.
// Port of `#editor-toggle-btn` + `.ed-template-grid` + save/clear controls
// from prototypes/poster-v3-ui.html:2450-2471.
//
// The Fabric.js overlay lives in prototypes/editor-overlay.jsx and will be
// wrapped into a React component in Phase 4/5. For now we dispatch custom
// events so the eventual wrapper can listen. IDs + classes are preserved so
// the prototype's existing DOM listeners on these same elements continue to
// fire when clicked (backward compat without importing from prototypes/).
const BUILT_IN_TEMPLATES = ['City Name', 'Minimal', 'Vintage', 'Journal', 'Modern']

export default function EditorSection() {
  if (IS_MOBILE) {
    return (
      <SidebarSection name="editor" title="Graphic Editor">
        <div
          style={{
            fontSize: 11,
            color: 'var(--ink-dim)',
            padding: '8px 4px',
            lineHeight: 1.5,
          }}
        >
          Graphic editor is only available on desktop.
        </div>
      </SidebarSection>
    )
  }

  const openEditor = () => {
    window.dispatchEvent(new CustomEvent('toggle-graphic-editor'))
  }
  const applyTemplate = (idx) => {
    window.dispatchEvent(new CustomEvent('apply-template', { detail: { index: idx } }))
  }
  const saveTemplate = () => {
    window.dispatchEvent(new CustomEvent('save-current-as-template'))
  }
  const clearOverlay = () => {
    window.dispatchEvent(new CustomEvent('clear-overlay'))
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
        onClick={openEditor}
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
          <button
            key={idx}
            className="ed-template-btn"
            type="button"
            data-template={idx}
            onClick={() => applyTemplate(idx)}
          >
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
          onClick={saveTemplate}
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
          onClick={clearOverlay}
        >
          Clear Overlay
        </button>
      </div>
    </SidebarSection>
  )
}
