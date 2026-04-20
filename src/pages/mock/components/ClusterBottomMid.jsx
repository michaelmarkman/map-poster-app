import { useSetAtom } from 'jotai'
import { SparkleIcon, CameraSnapIcon } from './icons'
import { modalsAtom } from '../../editor/atoms/modals'

// Centered bottom split button — Capture (left half) and AI Render (right
// half) share one glass pill divided by a hairline. Visually communicates
// "two ways to produce output from this poster" as a single primary action.
export default function ClusterBottomMid() {
  const setModals = useSetAtom(modalsAtom)
  return (
    <div className="mock-cluster mock-cluster--bottom-mid">
      <div className="mock-split-pill" role="group" aria-label="Output">
        <button
          type="button"
          className="mock-split-pill-btn"
          onClick={() => window.dispatchEvent(new Event('quick-download'))}
        >
          <span className="mock-pill-icon"><CameraSnapIcon /></span>
          <span className="mock-pill-label">Capture</span>
        </button>
        <span className="mock-split-pill-divider" aria-hidden="true" />
        <button
          type="button"
          className="mock-split-pill-btn"
          onClick={() => setModals((m) => ({ ...m, aiRender: true }))}
        >
          <span className="mock-pill-icon"><SparkleIcon /></span>
          <span className="mock-pill-label">Render</span>
        </button>
      </div>
    </div>
  )
}
