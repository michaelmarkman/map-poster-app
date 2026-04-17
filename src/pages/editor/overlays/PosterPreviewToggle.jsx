import { useAtom } from 'jotai'
import { modalsAtom } from '../atoms/modals'

// Floating top-right toggle for the 3D poster-frame preview. Flips
// modalsAtom.posterPreview; PosterPreviewModal snapshots the canvas on
// open and renders the frame at the current aspect ratio.
export default function PosterPreviewToggle() {
  const [modals, setModals] = useAtom(modalsAtom)
  const on = modals.posterPreview
  return (
    <button
      id="poster-preview-toggle"
      type="button"
      className={`poster-preview-toggle${on ? ' on' : ''}`}
      title={on ? 'Close poster preview (P)' : 'Preview as poster (P)'}
      aria-label={on ? 'Close poster preview' : 'Preview as poster'}
      aria-pressed={on}
      onClick={() => setModals((m) => ({ ...m, posterPreview: !on }))}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
        {/* Picture frame icon */}
        <rect x="4" y="4" width="16" height="16" rx="1" />
        <rect x="7" y="7" width="10" height="10" />
      </svg>
    </button>
  )
}
