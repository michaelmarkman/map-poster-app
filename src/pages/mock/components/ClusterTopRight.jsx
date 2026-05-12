import { useAtomValue, useSetAtom } from 'jotai'
import HoverPopoverPill from './HoverPopoverPill'
import RenderCountChip from './RenderCountChip'
import { ImageIcon } from './icons'
import { modalsAtom } from '../../editor/atoms/modals'
import {
  galleryCountAtom,
  galleryEntriesAtom,
} from '../../editor/atoms/gallery'

// Phase 7 — prototype's TR cluster holds the Gallery pill.
// Phase 16 — pill now opens a preview MENU (hover-popover) showing
// the 12 most recent renders + a "View all" CTA, instead of going
// straight to the full GalleryModal. The mini-grid mirrors the
// prototype's `.menu-gallery-grid`: 3-column 3:4 tiles with the
// most-recent label + relative time. Clicking a tile opens the
// lightbox at that entry's index; clicking "View all" opens the
// modal.
//
// RenderCountChip stays mounted but hidden under .mock-mounted via
// the Phase 6 display:none rule.

// Format "2 hours ago" / "3 days ago" — short rangefinder-style
// relative time stamps, mirroring the prototype.
function timeAgo(ts) {
  if (ts == null) return ''
  const d = typeof ts === 'number' ? new Date(ts) : ts
  const ms = Date.now() - d.getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const s = Math.round(ms / 1000)
  if (s < 60) return 'now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.round(h / 24)
  return `${days}d ago`
}

export default function ClusterTopRight() {
  const setModals = useSetAtom(modalsAtom)
  const galleryCount = useAtomValue(galleryCountAtom)
  const entries = useAtomValue(galleryEntriesAtom)

  // Show the 9 most recent (3×3 mini-grid). Gallery atoms hold
  // entries oldest-first, so slice from the end.
  const recent = entries.slice(-9).reverse()

  const openGallery = () => setModals((m) => ({ ...m, gallery: true }))
  const openLightboxAt = (entry) => {
    // Lightbox.jsx's preferred open path is `open-lightbox` with the
    // full entries list + `startIndex` (NOT `index` — that was the
    // bug: Lightbox reads `detail.startIndex | 0`, so passing
    // `index` silently fell back to 0 and always opened the oldest
    // photo).
    const idx = entries.findIndex((e) => e.id === entry.id)
    window.dispatchEvent(
      new CustomEvent('open-lightbox', {
        detail: { entries, startIndex: idx >= 0 ? idx : 0 },
      }),
    )
    setModals((m) => ({ ...m, lightbox: true }))
  }

  return (
    <div className="mock-cluster mock-cluster--top-right">
      <RenderCountChip />
      <HoverPopoverPill
        icon={<ImageIcon />}
        label="Gallery"
        value={galleryCount || 0}
        align="right"
        drop="down"
        alwaysShowPopover
        panelClassName="mock-popover--gallery-preview"
      >
        <div className="mock-menu-gallery">
          <div className="mock-menu-gallery-head">
            <span className="mock-menu-section-label">Gallery</span>
            <button
              type="button"
              className="mock-menu-gallery-viewall"
              onClick={openGallery}
            >
              <span>View all</span>
              <svg viewBox="0 0 11 11" aria-hidden="true">
                <path d="M3 5.5h5M5.5 3l2.5 2.5-2.5 2.5" />
              </svg>
            </button>
          </div>
          {recent.length === 0 ? (
            <div className="mock-menu-gallery-empty">
              No renders yet. Capture one and it lands here.
            </div>
          ) : (
            <div className="mock-menu-gallery-grid">
              {recent.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="mock-menu-gallery-tile"
                  onClick={() => openLightboxAt(entry)}
                  aria-label={`Open ${entry.label || 'render'}`}
                  title={entry.label || ''}
                >
                  <img
                    src={entry.dataUrl}
                    alt={entry.label || ''}
                    draggable={false}
                    loading="lazy"
                  />
                  <span className="mock-menu-gallery-tile-meta">
                    <span className="mock-menu-gallery-tile-label">
                      {entry.label || 'Untitled'}
                    </span>
                    <span className="mock-menu-gallery-tile-time">
                      {timeAgo(entry.time)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </HoverPopoverPill>
    </div>
  )
}
