import { useEffect, useRef } from 'react'
import { useAtom } from 'jotai'
import SidebarSection from './SidebarSection'
import { aspectRatioAtom, fillModeAtom } from '../atoms/ui'

// Ratio grids — 4 each, matching prototype markup exactly.
const PORTRAIT_RATIOS = [
  { label: '4:5', ratio: 0.8 },
  { label: '2:3', ratio: 0.667 },
  { label: '3:4', ratio: 0.75 },
  { label: '9:16', ratio: 0.5625 },
]
const LANDSCAPE_RATIOS = [
  { label: '5:4', ratio: 1.25 },
  { label: '3:2', ratio: 1.5 },
  { label: '4:3', ratio: 1.333 },
  { label: '16:9', ratio: 1.778 },
]

// Chrome bug: nested `min(..., calc(... / var(--ratio)))` doesn't always
// recompute when the custom property changes via inline style — the height
// sticks to its previous value. Toggling display off + reading offsetHeight
// forces a style recalc + reflow. Exposed on window so session-restore and
// any other setProperty('--ratio', …) caller can trigger it too.
// Defined at module scope to match the original `window.__forceCanvasReflow`
// pattern from prototypes/poster-v3-ui.jsx.
if (typeof window !== 'undefined' && !window.__forceCanvasReflow) {
  window.__forceCanvasReflow = () => {
    const el = document.getElementById('canvas-container')
    if (!el) return
    const prev = el.style.display
    el.style.display = 'none'
    void el.offsetHeight
    el.style.display = prev
  }
}

const TRANSITION_MS = 500

// Takes a PNG data URL of whatever's currently on the R3F canvas so we can
// freeze the frame while the container animates to a new aspect ratio. If
// the canvas isn't mounted yet, returns null — the caller falls through to
// the plain (non-smoothed) CSS transition.
function snapshotActiveCanvas() {
  const canvas = document.querySelector('#r3f-root canvas')
  if (!canvas) return null
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

// Overlay a static <img> of the current canvas content on top of the live
// canvas while the container animates. Zero WebGL work happens during the
// animation window — the img scales via CSS with the container, then we
// fade it out and the live canvas takes over again. Guaranteed smooth at
// the cost of a ~500ms "frozen" view during the transition.
function playSnapshotTransition(container, snapshotUrl) {
  if (!container || !snapshotUrl) return
  const img = document.createElement('img')
  img.src = snapshotUrl
  img.alt = ''
  img.setAttribute('aria-hidden', 'true')
  img.style.cssText = [
    'position: absolute',
    'inset: 0',
    'width: 100%',
    'height: 100%',
    'object-fit: cover',
    'pointer-events: none',
    'z-index: 5',
    'opacity: 1',
    // No transform; `object-fit: cover` + animated container width/height
    // is enough to keep the frame centered and edge-to-edge.
    'transition: opacity 140ms ease-out',
  ].join(';')
  container.appendChild(img)
  const removeAt = setTimeout(() => {
    img.style.opacity = '0'
    setTimeout(() => { if (img.parentNode) img.parentNode.removeChild(img) }, 160)
  }, TRANSITION_MS)
  // Hand the cleanup back so a rapid re-trigger can cancel cleanly.
  return () => {
    clearTimeout(removeAt)
    if (img.parentNode) img.parentNode.removeChild(img)
  }
}

export default function CanvasSection() {
  const [aspectRatio, setAspectRatio] = useAtom(aspectRatioAtom)
  const [fillMode, setFillMode] = useAtom(fillModeAtom)

  // Skip the snapshot overlay on the very first effect run — that's the
  // initial mount / session-restore pass, where the container is already
  // at the right size and we'd be overlaying the canvas with itself for
  // no reason.
  const firstRunRef = useRef(true)

  // Sync --ratio CSS var + fill-mode body class whenever state changes.
  // Smooth animation strategy: snapshot the current canvas, overlay it as
  // a static <img>, change the CSS, let the container transition to the
  // new size while the img scales with it. Fade out + remove the overlay
  // at the end. No gl.setSize churn → no jumpy re-renders.
  useEffect(() => {
    const container = document.getElementById('canvas-container')
    const isFirstRun = firstRunRef.current
    firstRunRef.current = false
    const snapshot = isFirstRun ? null : snapshotActiveCanvas()
    document.body.classList.toggle('fill-mode', fillMode)
    if (container) {
      if (fillMode) container.style.removeProperty('--ratio')
      else container.style.setProperty('--ratio', aspectRatio)
    }
    window.__forceCanvasReflow?.()
    const cleanupOverlay = playSnapshotTransition(container, snapshot)

    // One resize dispatch at the END of the transition so R3F's camera
    // aspect lands on the final dimensions before the overlay fades.
    const resizeTimer = setTimeout(
      () => window.dispatchEvent(new Event('resize')),
      TRANSITION_MS + 20,
    )

    const label = fillMode
      ? 'Fill'
      : [...PORTRAIT_RATIOS, ...LANDSCAPE_RATIOS].find(
          (r) => r.ratio === aspectRatio,
        )?.label ?? ''
    window.dispatchEvent(
      new CustomEvent('aspect-changed', {
        detail: { label, ratio: aspectRatio, fill: fillMode },
      }),
    )

    return () => {
      clearTimeout(resizeTimer)
      cleanupOverlay?.()
    }
  }, [aspectRatio, fillMode])

  const pickRatio = (ratio) => {
    setFillMode(false)
    setAspectRatio(ratio)
  }
  const pickFill = () => {
    setFillMode(true)
  }
  const openPreview = () => {
    window.dispatchEvent(new CustomEvent('open-poster-preview'))
  }

  const isActive = (r) => !fillMode && r === aspectRatio

  return (
    <SidebarSection name="canvas" title="Canvas">
      <div className="ratio-label">Portrait</div>
      <div className="ratio-grid" id="size-grid-portrait">
        {PORTRAIT_RATIOS.map(({ label, ratio }) => (
          <button
            key={label}
            type="button"
            className={`size-btn${isActive(ratio) ? ' active' : ''}`}
            data-ratio={ratio}
            onClick={() => pickRatio(ratio)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="ratio-label">Landscape</div>
      <div className="ratio-grid" id="size-grid-landscape">
        {LANDSCAPE_RATIOS.map(({ label, ratio }) => (
          <button
            key={label}
            type="button"
            className={`size-btn${isActive(ratio) ? ' active' : ''}`}
            data-ratio={ratio}
            onClick={() => pickRatio(ratio)}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        id="size-fill-btn"
        className={`fill-btn${fillMode ? ' active' : ''}`}
        data-fill="true"
        onClick={pickFill}
      >
        Fill — no ratio
      </button>

      {/* legacy size-grid container kept for JS compatibility (unused) */}
      <div id="size-grid" style={{ display: 'none' }}></div>

      <button
        type="button"
        id="poster-3d-btn"
        className="nav-row"
        style={{ marginTop: 14 }}
        onClick={openPreview}
      >
        <span>Poster preview</span>
        <span className="right">
          <span>3D frame</span>
          <span className="chev">›</span>
        </span>
      </button>
    </SidebarSection>
  )
}
