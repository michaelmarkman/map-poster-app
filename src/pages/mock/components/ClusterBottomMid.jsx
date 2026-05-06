import { useSetAtom } from 'jotai'
import Pill from './Pill'
import { CameraSnapIcon } from './icons'
import { modalsAtom } from '../../editor/atoms/modals'

// Phase 2.7 — Capture is now a single primary button that opens the
// AI Render sheet. The old split-pill (Capture | Render) merged into
// one entry point: clicking Capture takes you to the Render menu,
// where 'Raw' is one of the preset cards (matches the existing useQueue
// flow). The legacy 'quick-download' event still exists and is reachable
// via the E keyboard shortcut for users who want a one-keystroke export.
export default function ClusterBottomMid() {
  const setModals = useSetAtom(modalsAtom)
  return (
    <div className="mock-cluster mock-cluster--bottom-mid">
      <Pill
        icon={<CameraSnapIcon />}
        onClick={() => setModals((m) => ({ ...m, aiRender: true }))}
        aria-label="Capture poster — opens render menu"
      >
        Capture
      </Pill>
    </div>
  )
}
