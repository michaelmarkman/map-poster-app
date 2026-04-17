import './styles/index.css'
import EditorCanvas from './scene/EditorCanvas'
import Sidebar from './sidebar/Sidebar'
import CanvasHUD from './overlays/CanvasHUD'
import TextOverlay from './overlays/TextOverlay'
import ModalManager from './modals/ModalManager'
import useGalleryData from './hooks/useGalleryData'
import useTimeMachine from './hooks/useTimeMachine'
import useSessionPersistence from './hooks/useSessionPersistence'
import useSavedViews from './hooks/useSavedViews'
import useQueue from './hooks/useQueue'

// Phase 4: modals + on-canvas overlays layered onto the sidebar+canvas shell.
// Phase 5 wires data hooks (session/gallery/views).
export default function EditorShell() {
  // Session persistence — restores atoms from localStorage on mount, saves
  // on atom changes (debounced) and on 'save-session' events.
  useSessionPersistence()

  // Gallery data layer — hydrates galleryEntriesAtom from IndexedDB and
  // listens for gallery-{add,delete,download-all} window events.
  useGalleryData()

  // Time Machine persistence + replay. Producer-side rendering pipeline
  // (Phase 7+) will call saveJob() to feed this and the modal.
  useTimeMachine()

  // Saved views — localStorage sync + save-view/load-view/delete-view wiring.
  useSavedViews()

  // Export queue — listens for quick-download / add-to-queue / generate-all
  // / batch-export / queue-clear-* events and drives queueAtom through the
  // render pipeline, firing gallery-add on each completed job.
  useQueue()

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
