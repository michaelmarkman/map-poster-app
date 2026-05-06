import { useAtom } from 'jotai'
import Pill from './Pill'
import HoverPopoverPill from './HoverPopoverPill'
import { FrameIcon } from './icons'
import { aspectRatioAtom, fillModeAtom } from '../../editor/atoms/ui'
import { modalsAtom } from '../../editor/atoms/modals'

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
const ALL_RATIOS = [...PORTRAIT_RATIOS, ...LANDSCAPE_RATIOS]

export default function ClusterBottomLeft() {
  const [aspectRatio, setAspectRatio] = useAtom(aspectRatioAtom)
  const [fillMode, setFillMode] = useAtom(fillModeAtom)
  const [modals, setModals] = useAtom(modalsAtom)

  const ratioLabel =
    ALL_RATIOS.find((r) => r.ratio === aspectRatio)?.label ?? '4:3'
  const sizeLabel = fillMode ? 'Preview' : ratioLabel

  const pickRatio = (r) => {
    setFillMode(false)
    setAspectRatio(r)
  }

  return (
    <div className="mock-cluster mock-cluster--bottom-left">
      <HoverPopoverPill
        label={sizeLabel}
        active={!fillMode}
        onToggle={() => setFillMode((v) => !v)}
        alwaysShowPopover
        align="left"
        drop="up"
        className="mock-aspect-pill-wrap"
      >
        <div className="mock-aspect-grid">
          <div className="mock-aspect-label">Portrait</div>
          <div className="mock-aspect-row">
            {PORTRAIT_RATIOS.map(({ label, ratio }) => (
              <button
                key={label}
                type="button"
                className={`mock-aspect-btn${!fillMode && ratio === aspectRatio ? ' is-active' : ''}`}
                onClick={() => pickRatio(ratio)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mock-aspect-label">Landscape</div>
          <div className="mock-aspect-row">
            {LANDSCAPE_RATIOS.map(({ label, ratio }) => (
              <button
                key={label}
                type="button"
                className={`mock-aspect-btn${!fillMode && ratio === aspectRatio ? ' is-active' : ''}`}
                onClick={() => pickRatio(ratio)}
              >
                {label}
              </button>
            ))}
          </div>
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
