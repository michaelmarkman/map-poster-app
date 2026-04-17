import { useEffect } from 'react'
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

export default function CanvasSection() {
  const [aspectRatio, setAspectRatio] = useAtom(aspectRatioAtom)
  const [fillMode, setFillMode] = useAtom(fillModeAtom)

  // Sync --ratio CSS var + fill-mode body class whenever state changes.
  // Also dispatch the reflow workaround + synthetic resize so R3F re-measures.
  useEffect(() => {
    const container = document.getElementById('canvas-container')
    document.body.classList.toggle('fill-mode', fillMode)
    if (container) {
      if (fillMode) container.style.removeProperty('--ratio')
      else container.style.setProperty('--ratio', aspectRatio)
    }
    window.__forceCanvasReflow?.()
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 50)

    // Let the HUD overlay (Phase 4) update its label without reaching into this component.
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

    return () => clearTimeout(t)
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
