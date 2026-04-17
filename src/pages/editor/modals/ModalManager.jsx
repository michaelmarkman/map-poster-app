import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { modalsAtom } from '../atoms/modals'
import GalleryModal from './GalleryModal'
import TimeMachineModal from './TimeMachineModal'
import Lightbox from './Lightbox'
import ShareModal from './ShareModal'
import PosterPreviewModal from './PosterPreviewModal'

// Priority order for Esc — top of stack closes first. Each modal also has
// its own self-gated Escape handler that cooperates via modalsAtom; the
// priority list here centralizes the stacking rule in one place so future
// modals don't need to re-derive it.
const ESC_PRIORITY = ['share', 'lightbox', 'posterPreview', 'timeMachine', 'gallery']

// Central mount point. Every modal is always rendered; each one self-gates
// with `if (!open) return null` so it can receive its own `open-*` window
// events while closed (PosterPreview / Lightbox stash payload in local state
// when the open event fires).
export default function ModalManager() {
  const modals = useAtomValue(modalsAtom)
  const setModals = useSetAtom(modalsAtom)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      const top = ESC_PRIORITY.find((name) => modals[name])
      if (!top) return
      setModals((m) => ({ ...m, [top]: false }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modals, setModals])

  return (
    <>
      <GalleryModal />
      <TimeMachineModal />
      <Lightbox />
      <ShareModal />
      <PosterPreviewModal />
    </>
  )
}
