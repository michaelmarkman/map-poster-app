import { useSetAtom, useAtomValue, useAtom } from 'jotai'
import Pill from './Pill'
import { ImageIcon } from './icons'
import { modalsAtom } from '../../editor/atoms/modals'
import { galleryCountAtom } from '../../editor/atoms/gallery'
import { dofUiVariantAtom } from '../atoms'

// DoF UI variant cycler — lab-only. Tap to cycle A → B → C → A. The label
// carries a short hint so it's self-explanatory at a glance.
const NEXT = { A: 'B', B: 'C', C: 'A' }
const HINT = {
  A: 'UI A · legacy sliders',
  B: 'UI B · aperture slider',
  C: 'UI C · aperture only',
}

function VariantCycler() {
  const [variant, setVariant] = useAtom(dofUiVariantAtom)
  return (
    <Pill onClick={() => setVariant(NEXT[variant])}>
      {HINT[variant]}
    </Pill>
  )
}

export default function ClusterBottomRight() {
  const setModals = useSetAtom(modalsAtom)
  const galleryCount = useAtomValue(galleryCountAtom)

  return (
    <div className="mock-cluster mock-cluster--bottom-right">
      <VariantCycler />
      <Pill
        icon={<ImageIcon />}
        onClick={() => setModals((m) => ({ ...m, gallery: true }))}
      >
        Gallery{galleryCount ? ` · ${galleryCount}` : ''}
      </Pill>
    </div>
  )
}
