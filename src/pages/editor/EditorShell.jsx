import './styles/index.css'

// Phase 2: mounts the R3F canvas. Phase 3 will add the sidebar alongside,
// Phase 4 will layer modals + overlays on top.
import EditorCanvas from './scene/EditorCanvas'

export default function EditorShell() {
  return (
    <div className="editor-root" style={{ position: 'fixed', inset: 0, background: '#1c1b1f' }}>
      <EditorCanvas />
    </div>
  )
}
