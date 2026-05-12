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

// Phase 16 — ported to the prototype's vertical-row aspect menu.
// Layout is now [icon] [ratio] [name] per row, divided into Square /
// Portrait / Landscape sections with mini-labels, plus a Fill row at
// the top and a Custom W:H input form at the bottom. The Phase 2.7
// W×H mnemonics (24 × 36, 18 × 24, etc.) stay as the right-side
// "name" so users still see the physical poster proportions; the
// ratio column gives the more compact W:H shorthand for the data-
// minded.
const PORTRAIT_RATIOS = [
  { ratioKey: '4:5',  name: '16 × 20',  ratio: 4 / 5 },
  { ratioKey: '3:4',  name: '18 × 24',  ratio: 3 / 4 },
  { ratioKey: '2:3',  name: '24 × 36',  ratio: 2 / 3 },
  { ratioKey: '9:16', name: 'Vertical', ratio: 9 / 16 },
]
const LANDSCAPE_RATIOS = [
  { ratioKey: '5:4',  name: '20 × 16', ratio: 5 / 4 },
  { ratioKey: '4:3',  name: '24 × 18', ratio: 4 / 3 },
  { ratioKey: '3:2',  name: '36 × 24', ratio: 3 / 2 },
  { ratioKey: '16:9', name: 'Wide',    ratio: 16 / 9 },
]
const ALL_RATIOS = [
  { ratioKey: '1:1', name: 'Square', ratio: 1 },
  ...PORTRAIT_RATIOS,
  ...LANDSCAPE_RATIOS,
]

const ratioMatch = (a, b) => Math.abs(a - b) < 0.001

// Aspect-menu row — [icon] [ratio shorthand] [name]. The icon's
// `::before` size comes from the [data-ratio="…"] CSS rule so each
// ratio gets a distinct miniature glyph (e.g. 16:9 = wide rectangle,
// 9:16 = tall rectangle, 1:1 = square). The `data-ratio` value is
// also the visible W:H text in the middle column — keeping the two
// in sync means new ratios slot in by adding one CSS rule.
function AspectRow({ ratioKey, name, active, onClick, displayLabel }) {
  return (
    <button
      type="button"
      className={`mock-menu-aspect-item${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      <span className="mock-menu-aspect-icon" data-ratio={ratioKey} aria-hidden="true" />
      <span className="mock-menu-aspect-ratio">{displayLabel ?? ratioKey}</span>
      <span className="mock-menu-aspect-name">{name}</span>
    </button>
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
    if (preset) return preset.name
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
        label="Aspect"
        value={ratioLabel}
        active={!fillMode}
        onToggle={() => setFillMode((v) => !v)}
        alwaysShowPopover
        align="left"
        drop="up"
        className="mock-aspect-pill-wrap"
      >
        <div className="mock-menu-aspect">
          <div className="mock-menu-section-label">Aspect ratio</div>
          <AspectRow
            ratioKey="fill"
            name="Fill"
            active={fillMode}
            onClick={() => setFillMode(true)}
            displayLabel="—"
          />
          <AspectRow
            ratioKey="1:1"
            name="Square"
            active={!fillMode && ratioMatch(1, aspectRatio)}
            onClick={() => pickRatio(1)}
          />

          <div className="mock-menu-divider" />
          <div className="mock-menu-section-label">Portrait</div>
          {PORTRAIT_RATIOS.map(({ ratioKey, name, ratio }) => (
            <AspectRow
              key={ratioKey}
              ratioKey={ratioKey}
              name={name}
              active={!fillMode && ratioMatch(ratio, aspectRatio)}
              onClick={() => pickRatio(ratio)}
            />
          ))}

          <div className="mock-menu-divider" />
          <div className="mock-menu-section-label">Landscape</div>
          {LANDSCAPE_RATIOS.map(({ ratioKey, name, ratio }) => (
            <AspectRow
              key={ratioKey}
              ratioKey={ratioKey}
              name={name}
              active={!fillMode && ratioMatch(ratio, aspectRatio)}
              onClick={() => pickRatio(ratio)}
            />
          ))}

          <div className="mock-menu-divider" />
          <div className="mock-menu-section-label">Custom</div>
          <form
            className={`mock-menu-aspect-custom${isCustom ? ' is-active' : ''}`}
            onSubmit={(e) => { e.preventDefault(); submitCustom() }}
          >
            <span className="mock-menu-aspect-icon" data-ratio="custom" aria-hidden="true" />
            <span className="mock-menu-aspect-custom-fields">
              <input
                type="number"
                step="0.1"
                min="0.1"
                placeholder="W"
                value={customW}
                onChange={(e) => setCustomW(e.target.value)}
                aria-label="Custom width"
                className="mock-menu-aspect-custom-input"
              />
              <span className="mock-menu-aspect-custom-sep">:</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                placeholder="H"
                value={customH}
                onChange={(e) => setCustomH(e.target.value)}
                aria-label="Custom height"
                className="mock-menu-aspect-custom-input"
              />
            </span>
            <button
              type="submit"
              className="mock-menu-aspect-custom-set"
              disabled={!customW || !customH}
            >
              Set
            </button>
          </form>
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

// Render a custom ratio as W × H using small integers when possible.
// (Integers up to 20×20 covers most user-typed values; otherwise fall
// back to a 1-decimal float.)
function formatCustomRatio(r) {
  if (!Number.isFinite(r) || r <= 0) return '—'
  for (let h = 1; h <= 20; h++) {
    for (let w = 1; w <= 20; w++) {
      if (Math.abs(w / h - r) < 0.005) return `${w} × ${h}`
    }
  }
  return r.toFixed(2)
}
