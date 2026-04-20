import { useSetAtom, useAtomValue } from 'jotai'
import Pill from './Pill'
import { ImageIcon } from './icons'
import { modalsAtom } from '../../editor/atoms/modals'
import { galleryCountAtom } from '../../editor/atoms/gallery'

export default function ClusterBottomRight() {
  const setModals = useSetAtom(modalsAtom)
  const galleryCount = useAtomValue(galleryCountAtom)

  return (
    <div className="mock-cluster mock-cluster--bottom-right">
      <Pill
        icon={<ImageIcon />}
        onClick={() => setModals((m) => ({ ...m, gallery: true }))}
      >
        Gallery{galleryCount ? ` · ${galleryCount}` : ''}
      </Pill>
    </div>
  )
}
