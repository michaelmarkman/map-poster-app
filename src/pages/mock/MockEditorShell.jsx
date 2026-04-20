import { useEffect } from 'react'
import { useAtomValue, useAtom, useSetAtom } from 'jotai'
import { Agentation } from 'agentation'
import '../editor/styles/index.css'
import './styles/mock.css'
import EditorCanvas from '../editor/scene/EditorCanvas'
import GalleryModal from '../editor/modals/GalleryModal'
import Lightbox from '../editor/modals/Lightbox'
import PosterPreviewModal from '../editor/modals/PosterPreviewModal'
import GraphicEditorOverlay from '../editor/graphics/GraphicEditorOverlay'
import useGalleryData from '../editor/hooks/useGalleryData'
import useSessionPersistence from '../editor/hooks/useSessionPersistence'
import useSavedViews from '../editor/hooks/useSavedViews'
import useQueue from '../editor/hooks/useQueue'
import useGraphicEditor from '../editor/hooks/useGraphicEditor'
import useSavedGraphics from './hooks/useSavedGraphics'
import { aspectRatioAtom, fillModeAtom } from '../editor/atoms/ui'
import { computeFrameRect } from './utils/frameRect'
import { editingBackdropAtom } from './atoms'
import ClusterTopLeft from './components/ClusterTopLeft'
import ClusterTopMid from './components/ClusterTopMid'
import ClusterTopRight from './components/ClusterTopRight'
import ClusterBottomLeft from './components/ClusterBottomLeft'
import ClusterBottomMid from './components/ClusterBottomMid'
import ClusterBottomRight from './components/ClusterBottomRight'
import FrameOverlay from './components/FrameOverlay'
import RenderBackdrop from './components/RenderBackdrop'
import AIRenderModal from './modals/AIRenderModal'

// /mock keeps the canvas at full viewport at all times — the aspect ratio is
// shown via a FrameOverlay on top instead of by resizing the canvas. We just
// fire 'aspect-changed' so any consumers (export pipeline, etc.) still know,
// and trigger a window resize so R3F re-fits the camera if the viewport
// itself changed shape.
function useAspectSync() {
  const aspectRatio = useAtomValue(aspectRatioAtom)
  const fillMode = useAtomValue(fillModeAtom)
  useEffect(() => {
    // Body class lets CSS branch on fill mode (e.g. hiding the Fabric
    // graphics layer so it doesn't sit on top of the unframed canvas).
    document.body.classList.toggle('mock-fill-mode', fillMode)
    window.dispatchEvent(
      new CustomEvent('aspect-changed', {
        detail: { ratio: aspectRatio, fill: fillMode },
      }),
    )
  }, [aspectRatio, fillMode])
}

// Cascading ESC handler for /mock — peels back each UI layer toward the
// cleanest fill view:
//   1st press → exit Edit mode (back to aspect)
//   2nd press → exit aspect (into fill / no-chrome preview)
// Modals + popovers consume ESC before this handler runs (they own their
// own listeners), so this only fires when nothing else needed it.
function useMockEscape() {
  const [fillMode, setFillMode] = useAtom(fillModeAtom)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (window.__editorActive) {
        e.preventDefault()
        window.dispatchEvent(new Event('toggle-graphic-editor'))
        return
      }
      if (!fillMode) {
        e.preventDefault()
        setFillMode(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fillMode, setFillMode])
}

// Listen for `edit-graphics-request` (fired by Lightbox's "Edit graphics"
// button) and:
//   1. Set the entry's baseImage as the canvas backdrop (RenderBackdrop
//      paints it over the WebGL scene).
//   2. Load the entry's saved graphicsJSON into Fabric so the user lands
//      on the same overlay as the original render.
//   3. Activate the editor.
// On Exit Editor we clear the backdrop so the live scene returns.
function useRenderEditing() {
  const setBackdrop = useSetAtom(editingBackdropAtom)
  useEffect(() => {
    const onEdit = async (e) => {
      const entry = e?.detail
      if (!entry) return
      const backdropSrc = entry.baseImage || entry.dataUrl
      if (backdropSrc) setBackdrop(backdropSrc)
      try {
        const mod = await import(/* @vite-ignore */ '/prototypes/editor-overlay.jsx')
        const fabric = mod?.fabricCanvas
        if (fabric) {
          if (entry.graphicsJSON) {
            try {
              await fabric.loadFromJSON(JSON.parse(entry.graphicsJSON))
              fabric.renderAll?.()
            } catch {}
          } else {
            fabric.clear?.()
          }
        }
        if (mod?.isEditorActive && !mod.isEditorActive()) {
          window.dispatchEvent(new Event('toggle-graphic-editor'))
        }
      } catch {}
    }
    const onEditorChange = (ev) => {
      // Clear the backdrop when the user exits the editor (so the live scene
      // returns). Activating the editor doesn't clear it.
      if (ev?.detail?.active === false) setBackdrop(null)
    }
    window.addEventListener('edit-graphics-request', onEdit)
    window.addEventListener('graphic-editor-changed', onEditorChange)
    return () => {
      window.removeEventListener('edit-graphics-request', onEdit)
      window.removeEventListener('graphic-editor-changed', onEditorChange)
    }
  }, [setBackdrop])
}

// Constrain the Fabric editor canvas to the poster (frame) area. Without
// this the Fabric canvas matches #canvas-container — which is full viewport
// in /mock — so users would add text/shapes outside the actual poster.
function useFabricFrameSync() {
  const aspectRatio = useAtomValue(aspectRatioAtom)
  const fillMode = useAtomValue(fillModeAtom)
  useEffect(() => {
    let canceled = false
    const apply = async () => {
      try {
        const mod = await import(/* @vite-ignore */ '/prototypes/editor-overlay.jsx')
        if (canceled) return
        const fabric = mod.fabricCanvas
        const wrap = document.querySelector('#canvas-container > .canvas-container')
        if (!wrap) return
        const rect = computeFrameRect(aspectRatio, fillMode)
        wrap.style.position = 'absolute'
        wrap.style.top = `${Math.round(rect.y)}px`
        wrap.style.left = `${Math.round(rect.x)}px`
        wrap.style.width = `${Math.round(rect.w)}px`
        wrap.style.height = `${Math.round(rect.h)}px`
        wrap.style.transition = 'top 0.45s cubic-bezier(0.22, 1, 0.36, 1), left 0.45s cubic-bezier(0.22, 1, 0.36, 1), width 0.45s cubic-bezier(0.22, 1, 0.36, 1), height 0.45s cubic-bezier(0.22, 1, 0.36, 1)'
        if (fabric?.setDimensions) {
          fabric.setDimensions({ width: Math.round(rect.w), height: Math.round(rect.h) })
          fabric.renderAll?.()
        }
      } catch {}
    }
    // Apply now and on every viewport / aspect change. Also re-apply when
    // the editor first becomes active (in case Fabric was created after
    // the last apply ran with no DOM to find).
    apply()
    const onResize = () => apply()
    const onEditor = () => apply()
    window.addEventListener('resize', onResize)
    window.addEventListener('graphic-editor-changed', onEditor)
    return () => {
      canceled = true
      window.removeEventListener('resize', onResize)
      window.removeEventListener('graphic-editor-changed', onEditor)
    }
  }, [aspectRatio, fillMode])
}

// Mock editor — floating-pills variant of /app. Reuses the editor's Scene,
// atoms, hooks, and most modals; swaps the sidebar chrome for ~11 floating
// pills around the canvas. See docs/superpowers/specs/2026-04-17-mock-editor-design.md
export default function MockEditorShell() {
  // Body scoping: reuse editor-mounted (gives us the * reset + base layout
  // from editor.css) and add mock-mounted for our overrides.
  useEffect(() => {
    document.body.classList.add('editor-mounted', 'mock-mounted')
    return () =>
      document.body.classList.remove('editor-mounted', 'mock-mounted')
  }, [])

  // Same hook surface as /app, minus time-machine + keyboard shortcuts.
  useSessionPersistence()
  useGalleryData()
  useSavedViews()
  useQueue()
  useGraphicEditor()
  useSavedGraphics()
  useAspectSync()
  useFabricFrameSync()
  useRenderEditing()
  useMockEscape()

  return (
    <div className="mock-root editor-root">
      <div id="main">
        <div id="canvas-container">
          <div id="r3f-root" style={{ position: 'absolute', inset: 0 }}>
            <EditorCanvas />
          </div>
          <RenderBackdrop />
        </div>
      </div>

      <FrameOverlay />

      <ClusterTopLeft />
      <ClusterTopMid />
      <ClusterTopRight />
      <ClusterBottomLeft />
      <ClusterBottomMid />
      <ClusterBottomRight />

      <GraphicEditorOverlay />
      <GalleryModal />
      <Lightbox />
      <PosterPreviewModal />
      <AIRenderModal />

      {/* Agentation — visual-feedback toolbar (bottom-right by default).
       * Click its icon, then click any element on the page to annotate it;
       * I can poll those annotations via the MCP to act on them. */}
      <Agentation />
    </div>
  )
}
