import { useEffect, useState, useCallback } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { modalsAtom, lightboxEntryAtom } from '../atoms/modals'
import { loadGalleryEntries, buildGalleryEntries } from '../utils/galleryDb'

// Gallery modal — shows all saved exports from IndexedDB. Ported from
// prototypes/poster-v3-ui.{html,jsx}. Clicking an entry stacks the lightbox
// on top; close button / Esc dismisses only the gallery.
export default function GalleryModal() {
  const [modals, setModals] = useAtom(modalsAtom)
  const setLightboxEntry = useSetAtom(lightboxEntryAtom)
  const [gallery, setGallery] = useState([])
  const [view, setView] = useState('grid') // 'grid' | 'large' | 'list'

  const open = modals.gallery

  // Listen for 'open-gallery' window event (dispatched by sidebar / shortcuts).
  useEffect(() => {
    const onOpen = () => setModals((m) => ({ ...m, gallery: true }))
    window.addEventListener('open-gallery', onOpen)
    return () => window.removeEventListener('open-gallery', onOpen)
  }, [setModals])

  // Load gallery whenever the modal opens so newly-saved exports show up.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    loadGalleryEntries().then((items) => {
      if (!cancelled) setGallery(items)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  const close = useCallback(() => {
    setModals((m) => ({ ...m, gallery: false }))
  }, [setModals])

  // Esc closes (only while open). If the lightbox is also open it handles its
  // own Esc — we only close gallery when lightbox is not stacked on top.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        // If lightbox is stacked, let it handle Esc first.
        setModals((m) => (m.lightbox ? m : { ...m, gallery: false }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setModals])

  const handleDownloadAll = () => {
    window.dispatchEvent(new CustomEvent('gallery-download-all', { detail: { gallery } }))
  }

  const openLightbox = (idx) => {
    const item = gallery[idx]
    if (!item) return
    // The IndexedDB returns gallery oldest-first. The grid displays it
    // newest-first (buildGalleryEntries reverses). For lightbox nav to
    // feel correct — left arrow = previous grid item (newer), right =
    // next (older) — we ship the reversed list to the lightbox and
    // translate the clicked index accordingly. Without this the arrow
    // keys walk the array in DB order, which is backwards to the user.
    const displayEntries = [...gallery].reverse()
    const displayStart = gallery.length - 1 - idx
    setLightboxEntry(item)
    window.dispatchEvent(
      new CustomEvent('open-lightbox', {
        detail: { entries: displayEntries, startIndex: displayStart },
      }),
    )
    setModals((m) => ({ ...m, lightbox: true })) // keep gallery: true — they stack
  }

  if (!open) return null

  const entries = buildGalleryEntries(gallery)
  const count = gallery.length
  const gridClass = 'gallery-grid' + (view !== 'grid' ? ` view-${view}` : '')

  return (
    <div className="modal open" id="gallery-overlay">
      <div className="modal-panel xwide">
        <div className="modal-header gallery-header">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span className="gallery-title">Gallery</span>
            <span className="gallery-count" id="gallery-count">
              {count} image{count !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="gallery-actions">
            <div className="view-toggles">
              {['grid', 'large', 'list'].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={'view-toggle' + (view === v ? ' active' : '')}
                  data-view={v}
                  onClick={() => setView(v)}
                >
                  {v === 'grid' ? 'Grid' : v === 'large' ? 'Large' : 'List'}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="gallery-btn accent"
              id="gallery-download-all"
              onClick={handleDownloadAll}
              disabled={count === 0}
            >
              Download all
            </button>
            <button
              type="button"
              className="modal-close"
              id="gallery-close"
              onClick={close}
            >
              ×
            </button>
          </div>
        </div>
        <div className="gallery-body">
          <div className={gridClass} id="gallery-grid">
            {entries.map((entry) =>
              entry.type === 'item' ? (
                <GalleryCard
                  key={entry.item.id}
                  item={entry.item}
                  onOpen={() => openLightbox(entry.idx)}
                />
              ) : (
                <BatchCard
                  key={entry.batchId}
                  entry={entry}
                  onOpen={() => {
                    const first = entry.items[0]
                    if (first) openLightbox(first.idx)
                  }}
                />
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatTime(d) {
  return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0')
}

function GalleryCard({ item, onOpen }) {
  const handleDownload = (e) => {
    e.stopPropagation()
    const link = document.createElement('a')
    link.download = item.filename + '.png'
    link.href = item.dataUrl
    link.click()
  }
  const handleShare = (e) => {
    e.stopPropagation()
    window.dispatchEvent(new CustomEvent('open-share', { detail: { item } }))
  }
  return (
    <div className="gallery-card" onClick={onOpen}>
      <img src={item.dataUrl} alt={item.label} />
      <div className="gc-dl" style={{ right: 38, fontSize: 11 }} title="Share to Community" onClick={handleShare}>
        {'\u2191'}
      </div>
      <div className="gc-dl" onClick={handleDownload}>
        {'\u2193'}
      </div>
      <div className="gc-info">
        <span className="gc-label">{item.label}</span>
        <span className="gc-time">{formatTime(item.time)}</span>
      </div>
    </div>
  )
}

function BatchCard({ entry, onOpen }) {
  const previews = entry.items.slice(0, 4)
  return (
    <div className="gallery-card gallery-batch" onClick={onOpen}>
      <div className="gc-mosaic">
        {previews.map(({ item }) => (
          <img key={item.id} src={item.dataUrl} alt={item.label} />
        ))}
      </div>
      <div className="gc-badge">{entry.items.length} styles</div>
      <div className="gc-info">
        <span className="gc-label">{entry.label}</span>
        <span className="gc-time">{formatTime(entry.time)}</span>
      </div>
    </div>
  )
}
