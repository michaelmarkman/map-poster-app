import { useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import '../editor/styles/index.css'
import './styles/mock.css'
import EditorCanvas from '../editor/scene/EditorCanvas'
import GalleryModal from '../editor/modals/GalleryModal'
import Lightbox from '../editor/modals/Lightbox'
import PosterPreviewModal from '../editor/modals/PosterPreviewModal'
import useSessionPersistence from '../editor/hooks/useSessionPersistence'
import useSavedViews from '../editor/hooks/useSavedViews'
import useQueue from '../editor/hooks/useQueue'
import useMockKeyboardShortcuts from './hooks/useMockKeyboardShortcuts'
import { aspectRatioAtom, fillModeAtom } from '../editor/atoms/ui'
import ClusterTopLeft from './components/ClusterTopLeft'
import ClusterTopRight from './components/ClusterTopRight'
import ClusterBottomLeft from './components/ClusterBottomLeft'
import ClusterBottomMid from './components/ClusterBottomMid'
import ClusterBottomRight from './components/ClusterBottomRight'
import FrameOverlay from './components/FrameOverlay'
import ViewfinderBrackets from './components/ViewfinderBrackets'
import OnboardingCard from './components/OnboardingCard'
import AIRenderModal from './modals/AIRenderModal'

// /app keeps the canvas at full viewport at all times — the aspect ratio is
// shown via a FrameOverlay on top instead of by resizing the canvas. We just
// fire 'aspect-changed' so any consumers (export pipeline, etc.) still know,
// and trigger a window resize so R3F re-fits the camera if the viewport
// itself changed shape.
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

// Phase 7.2 — when navigated to from the community page with a saved view
// stashed in sessionStorage, dispatch restore-view once the canvas is up.
// Cleared after one consumption so reloads don't repeat it.
function usePendingRestore() {
  useEffect(() => {
    let raw
    try { raw = sessionStorage.getItem('vedute_pending_restore') } catch { raw = null }
    if (!raw) return
    try { sessionStorage.removeItem('vedute_pending_restore') } catch {}
    let view
    try { view = JSON.parse(raw) } catch { return }
    // Defer past Scene's mount + listener attach. Same delay as
    // useSavedViews's default-view auto-load (Phase 4.3).
    const t = setTimeout(() => {
      try { window.dispatchEvent(new CustomEvent('restore-view', { detail: view })) } catch {}
    }, 600)
    return () => clearTimeout(t)
  }, [])
}

// ESC peels back UI layers toward fill-screen. Modals + popovers consume
// ESC before this fires (their own listeners win), so this only handles
// the "no chrome should be visible" reach.
function useMockEscape() {
  const fillMode = useAtomValue(fillModeAtom)
  const setFillMode = useSetAtom(fillModeAtom)
  // Mirror fillMode into a ref so the keydown listener can branch on
  // its current value without forcing the effect to re-attach the
  // listener every toggle. Update the ref inside useEffect — under
  // React 19 concurrent rendering, ref writes that happen during the
  // render function body can be silently dropped if the render is
  // restarted. See LEARNINGS 2026-04-17 ("R19 concurrent rendering").
  const fillModeRef = useRef(fillMode)
  useEffect(() => {
    fillModeRef.current = fillMode
  }, [fillMode])
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (!fillModeRef.current) {
        e.preventDefault()
        setFillMode(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setFillMode])
}

// Pill editor — the canonical (and only) editor at /app.
//
// The "Mock" name is historical: this started as a /mock-prefixed prototype
// alongside the legacy sidebar editor (deleted in Phase 1.2). File/folder
// names, `.mock-*` CSS classes, and `body.mock-mounted` are namespaces —
// keep them as-is until a dedicated rename PR; renaming touches ~60 CSS
// classes plus every import in this folder, all for cosmetic gain.
//
// See docs/superpowers/specs/2026-04-17-mock-editor-design.md
export default function MockEditorShell() {
  useEffect(() => {
    document.body.classList.add('editor-mounted', 'mock-mounted')
    return () =>
      document.body.classList.remove('editor-mounted', 'mock-mounted')
  }, [])

  useSessionPersistence()
  // useGalleryData is mounted app-wide in App.jsx (not here) so the
  // gallery-add listener survives navigation away from /app while a
  // render is in flight.
  useSavedViews()
  useQueue()
  useAspectSync()
  useMockEscape()
  useMockKeyboardShortcuts()
  usePendingRestore()

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

      {/* Phase 1 — MoMA chrome. Four L-shaped corner brackets framing
       * the viewport, drawn above the canvas but below cluster pills
       * (z-index var(--z-overlay)). Pure presentation. */}
      <ViewfinderBrackets />

      {/* Top-center wordmark — non-interactive overlay so it doesn't
       * intercept canvas clicks (click-to-focus, orbit). The SVG itself
       * carries a built-in soft drop-shadow so it stays legible over
       * bright sky / sunlit terrain without an extra treatment. */}
      <img
        src="/wordmark.svg"
        alt="Vedute"
        className="mock-wordmark"
        aria-hidden="true"
      />

      <ClusterTopLeft />
      <ClusterTopRight />
      <ClusterBottomLeft />
      <ClusterBottomMid />
      <ClusterBottomRight />

      <GalleryModal />
      <Lightbox />
      <PosterPreviewModal />
      <AIRenderModal />
      {/* IntroSequence was retired pre-launch — it staged the load on
       *  cold boots but the cost (extra ~7.5s before the editor is
       *  usable, plus tegaki font load) didn't pay for itself once
       *  WebGL warm-up dropped under a second. introDoneAtom now
       *  defaults to true so OnboardingCard appears immediately. */}
      <OnboardingCard />
      {/* ToastHost lives in App.jsx (mounted once app-wide). */}
    </div>
  )
}
