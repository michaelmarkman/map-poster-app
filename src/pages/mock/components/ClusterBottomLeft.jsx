import { useAtom } from 'jotai'
import { useMemo, useState } from 'react'
import Pill from './Pill'
import HoverPopoverPill from './HoverPopoverPill'
import { FrameIcon } from './icons'
import { aspectRatioAtom, fillModeAtom } from '../../editor/atoms/ui'
import { modalsAtom } from '../../editor/atoms/modals'

// Phase 2.2 — visually clearer aspect picker with custom W:H input and a
// "Fill" choice integrated into the same control instead of a separate
// toggle. aspectRatioAtom stays a plain number (the ratio w/h); fillMode
// is still its own atom but the UI treats them as one selection.

const PORTRAIT_RATIOS = [
  { label: '4:5', ratio: 4 / 5 },
  { label: '2:3', ratio: 2 / 3 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '9:16', ratio: 9 / 16 },
]
const LANDSCAPE_RATIOS = [
  { label: '5:4', ratio: 5 / 4 },
  { label: '3:2', ratio: 3 / 2 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '16:9', ratio: 16 / 9 },
]
const ALL_RATIOS = [...PORTRAIT_RATIOS, ...LANDSCAPE_RATIOS]

const ratioMatch = (a, b) => Math.abs(a - b) < 0.001

// Render a tiny rectangle preview of the chosen ratio inside a fixed
// 24x24 box. Helps users grok the shape without leaving the popover.
function RatioGlyph({ ratio, fill }) {
  if (fill) {
    return <span className="mock-ratio-glyph mock-ratio-glyph--fill" />
  }
  // Fit the rectangle inside a 20x20 box, centered.
  const max = 20
  const w = ratio >= 1 ? max : max * ratio
  const h = ratio >= 1 ? max / ratio : max
  return (
    <span
      className="mock-ratio-glyph"
      style={{ width: `${w}px`, height: `${h}px` }}
    />
  )
}

export default function ClusterBottomLeft() {
  const [aspectRatio, setAspectRatio] = useAtom(aspectRatioAtom)
  const [fillMode, setFillMode] = useAtom(fillModeAtom)
  const [modals, setModals] = useAtom(modalsAtom)
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')

  const ratioLabel = useMemo(() => {
    if (fillMode) return 'Fill'
    const preset = ALL_RATIOS.find((r) => ratioMatch(r.ratio, aspectRatio))
    if (preset) return preset.label
    // Custom: try to render as nice integers.
    return formatCustomRatio(aspectRatio)
  }, [aspectRatio, fillMode])

  const pickRatio = (r) => {
    setFillMode(false)
    setAspectRatio(r)
  }

  const submitCustom = () => {
    const w = parseFloat(customW)
    const h = parseFloat(customH)
    if (!Number.isFinite(w) || !Number.isFinite(h)) return
    if (w <= 0 || h <= 0) return
    pickRatio(w / h)
    setCustomW('')
    setCustomH('')
  }

  const isCustom =
    !fillMode && !ALL_RATIOS.some((r) => ratioMatch(r.ratio, aspectRatio))

  return (
    <div className="mock-cluster mock-cluster--bottom-left">
      <HoverPopoverPill
        label={ratioLabel}
        active={!fillMode}
        onToggle={() => setFillMode((v) => !v)}
        alwaysShowPopover
        align="left"
        drop="up"
        className="mock-aspect-pill-wrap"
      >
        <div className="mock-aspect-grid">
          <button
            type="button"
            className={`mock-aspect-row mock-aspect-fill-row${fillMode ? ' is-active' : ''}`}
            onClick={() => setFillMode(true)}
          >
            <RatioGlyph fill />
            <span className="mock-aspect-fill-label">Fill</span>
          </button>

          <div className="mock-aspect-label">Portrait</div>
          <div className="mock-aspect-row">
            {PORTRAIT_RATIOS.map(({ label, ratio }) => (
              <button
                key={label}
                type="button"
                className={`mock-aspect-btn${
                  !fillMode && ratioMatch(ratio, aspectRatio) ? ' is-active' : ''
                }`}
                onClick={() => pickRatio(ratio)}
                title={label}
              >
                <RatioGlyph ratio={ratio} />
                <span className="mock-aspect-btn-label">{label}</span>
              </button>
            ))}
          </div>

          <div className="mock-aspect-label">Landscape</div>
          <div className="mock-aspect-row">
            {LANDSCAPE_RATIOS.map(({ label, ratio }) => (
              <button
                key={label}
                type="button"
                className={`mock-aspect-btn${
                  !fillMode && ratioMatch(ratio, aspectRatio) ? ' is-active' : ''
                }`}
                onClick={() => pickRatio(ratio)}
                title={label}
              >
                <RatioGlyph ratio={ratio} />
                <span className="mock-aspect-btn-label">{label}</span>
              </button>
            ))}
          </div>

          <div className="mock-aspect-label">Custom</div>
          <form
            className="mock-aspect-custom"
            onSubmit={(e) => { e.preventDefault(); submitCustom() }}
          >
            <input
              type="number"
              step="0.1"
              min="0.1"
              placeholder="W"
              value={customW}
              onChange={(e) => setCustomW(e.target.value)}
              aria-label="Custom width"
              className="mock-aspect-custom-input"
            />
            <span className="mock-aspect-custom-sep">:</span>
            <input
              type="number"
              step="0.1"
              min="0.1"
              placeholder="H"
              value={customH}
              onChange={(e) => setCustomH(e.target.value)}
              aria-label="Custom height"
              className="mock-aspect-custom-input"
            />
            <button
              type="submit"
              className="mock-aspect-custom-apply"
              disabled={!customW || !customH}
            >
              Set
            </button>
          </form>
          {isCustom && (
            <div className="mock-aspect-custom-current">
              Active: {ratioLabel}
            </div>
          )}
        </div>
      </HoverPopoverPill>

      {!fillMode && (
        <Pill
          icon={<FrameIcon />}
          active={modals.posterPreview}
          onClick={() => setModals((m) => ({ ...m, posterPreview: !m.posterPreview }))}
          aria-label="Toggle poster preview"
          title="Poster preview"
        />
      )}
    </div>
  )
}

// Render a custom ratio as W:H using small integers when possible.
// (Integers up to 20:20 covers most user-typed values; otherwise fall back
// to a 1-decimal float.)
function formatCustomRatio(r) {
  if (!Number.isFinite(r) || r <= 0) return '—'
  for (let h = 1; h <= 20; h++) {
    for (let w = 1; w <= 20; w++) {
      if (Math.abs(w / h - r) < 0.005) return `${w}:${h}`
    }
  }
  return r.toFixed(2)
}
