import { useAtomValue, useSetAtom } from 'jotai'
import Pill from './Pill'
import RenderCountChip from './RenderCountChip'
import { ImageIcon } from './icons'
import { modalsAtom } from '../../editor/atoms/modals'
import { galleryCountAtom } from '../../editor/atoms/gallery'

// Phase 7 — prototype's TR cluster holds ONLY the Gallery pill.
// (RenderCountChip stays mounted but is hidden under .mock-mounted in
// mock.css — kept for the React tree's state subscriptions and for
// future re-introduction in a MoMA-styled account/render-budget UI.)
//
// The 4 scrub pills (Lens / DoF / Time / Clouds) moved to BR per the
// prototype's geography (Phase 6 introduced the 4-pill split; Phase 7
// relocates them).
export default function ClusterTopRight() {
  const setModals = useSetAtom(modalsAtom)
  const galleryCount = useAtomValue(galleryCountAtom)
  return (
    <div className="mock-cluster mock-cluster--top-right">
      <RenderCountChip />
      <Pill
        icon={<ImageIcon />}
        label="Gallery"
        value={galleryCount || 0}
        onClick={() => setModals((m) => ({ ...m, gallery: true }))}
      />
    </div>
  )
}
