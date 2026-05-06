import { useEffect } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import '../editor/styles/index.css'
import './styles/mock.css'
import EditorCanvas from '../editor/scene/EditorCanvas'
import GalleryModal from '../editor/modals/GalleryModal'
import Lightbox from '../editor/modals/Lightbox'
import PosterPreviewModal from '../editor/modals/PosterPreviewModal'
import useSessionPersistence from '../editor/hooks/useSessionPersistence'
import useSavedViews from '../editor/hooks/useSavedViews'
import useQueue from '../editor/hooks/useQueue'
import { aspectRatioAtom, fillModeAtom } from '../editor/atoms/ui'
import ClusterTopLeft from './components/ClusterTopLeft'
import ClusterTopMid from './components/ClusterTopMid'
import ClusterTopRight from './components/ClusterTopRight'
import ClusterBottomLeft from './components/ClusterBottomLeft'
import ClusterBottomMid from './components/ClusterBottomMid'
import ClusterBottomRight from './components/ClusterBottomRight'
import FrameOverlay from './components/FrameOverlay'
import AIRenderModal from './modals/AIRenderModal'

function useAspectSync() {
  const aspectRatio = useAtomValue(aspectRatioAtom)
  const fillMode = useAtomValue(fillModeAtom)
  useEffect(() => {
    document.body.classList.toggle('mock-fill-mode', fillMode)
    window.dispatchEvent(
      new CustomEvent('aspect-changed', {
        detail: { ratio: aspectRatio, fill: fillMode },
      }),
    )
  }, [aspectRatio, fillMode])
}

function useDofLabEscape() {
  const [fillMode, setFillMode] = useAtom(fillModeAtom)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (!fillMode) {
        e.preventDefault()
        setFillMode(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fillMode, setFillMode])
}

export default function DofLabShell() {
  useEffect(() => {
    document.body.classList.add('editor-mounted', 'mock-mounted')
    return () =>
      document.body.classList.remove('editor-mounted', 'mock-mounted')
  }, [])

  useSessionPersistence()
  // useGalleryData lives app-wide in App.jsx; see MockEditorShell note.
  useSavedViews()
  useQueue()
  useAspectSync()
  useDofLabEscape()

  return (
    <div className="mock-root editor-root">
      <div id="main">
        <div id="canvas-container">
          <div id="r3f-root" style={{ position: 'absolute', inset: 0 }}>
            <EditorCanvas />
          </div>
        </div>
      </div>

      <FrameOverlay />

      <ClusterTopLeft />
      <ClusterTopMid />
      <ClusterTopRight />
      <ClusterBottomLeft />
      <ClusterBottomMid />
      <ClusterBottomRight />

      <GalleryModal />
      <Lightbox />
      <PosterPreviewModal />
      <AIRenderModal />
    </div>
  )
}
