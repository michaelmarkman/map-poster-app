import './styles/index.css'
import EditorCanvas from './scene/EditorCanvas'
import Sidebar from './sidebar/Sidebar'

// Phase 3: sidebar + canvas laid out side-by-side. Phase 4 will layer modals
// + overlays on top; Phase 5 will plug in data hooks (session/gallery/views).
export default function EditorShell() {
  return (
    <div className="editor-root" style={{ position: 'fixed', inset: 0, background: '#1c1b1f' }}>
      <Sidebar />
      <div id="main">
        <div id="canvas-container">
          <div id="r3f-root" style={{ position: 'absolute', inset: 0 }}>
            <EditorCanvas />
          </div>
        </div>
      </div>
    </div>
  )
}
