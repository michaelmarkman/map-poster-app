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
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts'
import useGraphicEditor from './hooks/useGraphicEditor'

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

  // Global keyboard shortcuts — `?` help, Cmd/Ctrl+S save, G gallery, T time
  // machine, V save view, F fill-mode toggle. Sidebar.jsx still owns `\`.
  useKeyboardShortcuts()

  // Graphic editor (Fabric.js) — lazy-loaded on desktop when the Graphic
  // Editor sidebar section's "Open Editor" button fires toggle-graphic-editor.
  useGraphicEditor()

  // `.editor-root` is intentionally transparent with no position — just a
  // flex pass-through so #main's `flex: 1` resolves. The previous
  // position:fixed + solid background broke sidebar backdrop-filter
  // because an opaque ancestor fill prevents the filter from reaching
  // the canvas underneath.
  return (
    <div className="editor-root">
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
