import { useAtomValue } from 'jotai'
import { aspectRatioAtom, fillModeAtom, cameraReadoutAtom } from '../atoms/ui'
import { dofAtom, timeOfDayAtom, latitudeAtom, longitudeAtom } from '../atoms/scene'

// Ratio -> label map. Kept in sync with sidebar/CanvasSection.jsx.
const RATIO_LABELS = [
  [0.5625, '9:16'],
  [0.667, '2:3'],
  [0.75, '3:4'],
  [0.8, '4:5'],
  [1.25, '5:4'],
  [1.333, '4:3'],
  [1.5, '3:2'],
  [1.778, '16:9'],
]

function ratioToLabel(ratio) {
  // Exact match first, then nearest within a small tolerance.
  const hit = RATIO_LABELS.find(([r]) => r === ratio)
  if (hit) return hit[1]
  const near = RATIO_LABELS.find(([r]) => Math.abs(r - ratio) < 0.01)
  return near ? near[1] : ratio.toFixed(2)
}

function fmtTime(h) {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  const ap = hh >= 12 ? 'pm' : 'am'
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
  return h12 + ':' + String(mm).padStart(2, '0') + ' ' + ap
}

function fmtCoords(lat, lng) {
  const latAbs = Math.abs(lat).toFixed(4)
  const lngAbs = Math.abs(lng).toFixed(4)
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${latAbs}\u00b0 ${ns} \u00b7 ${lngAbs}\u00b0 ${ew}`
}

// On-canvas HUD: three pills in the top-right (.canvas-hud) + a two-line
// corner meta in the bottom-right (.corner-meta). Bundled into one component
// since they share the same set of atom subscriptions.
export default function CanvasHUD() {
  const ratio = useAtomValue(aspectRatioAtom)
  const fill = useAtomValue(fillModeAtom)
  const readout = useAtomValue(cameraReadoutAtom)
  const dof = useAtomValue(dofAtom)
  const tod = useAtomValue(timeOfDayAtom)
  const lat = useAtomValue(latitudeAtom)
  const lng = useAtomValue(longitudeAtom)

  const ratioLabel = fill ? 'Fill' : ratioToLabel(ratio)
  // Matches the static HTML markup: "f/1.8" when DoF is on, blank when off.
  const dofLabel = dof.on ? 'f/1.8' : ''

  return (
    <>
      <div className="canvas-hud">
        <span id="hud-ratio">{ratioLabel}</span>
        <div className="dot"></div>
        <span id="hud-lens">{readout.fovMm}mm</span>
        <div className="dot"></div>
        <span className="val" id="hud-dof">{dofLabel}</span>
      </div>
      <div className="corner-meta">
        <span id="corner-coords">{fmtCoords(lat, lng)}</span><br />
        <span id="corner-time">{fmtTime(tod)}</span>
      </div>
    </>
  )
}
