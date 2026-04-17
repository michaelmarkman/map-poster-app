import './styles/index.css'
import EditorCanvas from './scene/EditorCanvas'
import Sidebar from './sidebar/Sidebar'
import CanvasHUD from './overlays/CanvasHUD'
import TextOverlay from './overlays/TextOverlay'
import ModalManager from './modals/ModalManager'

// Phase 4: modals + on-canvas overlays layered onto the sidebar+canvas shell.
// Phase 5 will plug in data hooks (session/gallery/views).
export default function EditorShell() {
  return (
    <div className="editor-root" style={{ position: 'fixed', inset: 0, background: '#1c1b1f' }}>
      <Sidebar />
      <div id="main">
        <div id="canvas-container">
          <div id="r3f-root" style={{ position: 'absolute', inset: 0 }}>
            <EditorCanvas />
          </div>
          <TextOverlay />
        </div>
        <CanvasHUD />
      </div>
      <ModalManager />
    </div>
  )
}
