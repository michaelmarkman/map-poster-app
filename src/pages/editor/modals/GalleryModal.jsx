import { useEffect, useState, useCallback } from 'react'
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { modalsAtom, lightboxEntryAtom } from '../atoms/modals'
import { galleryEntriesAtom } from '../atoms/gallery'
import { buildGalleryEntries } from '../utils/galleryDb'
import { shareEntry } from '../../../lib/share'

// Gallery modal — shows all saved exports from IndexedDB. Ported from
// prototypes/poster-v3-ui.{html,jsx}. Clicking an entry stacks the lightbox
// on top; close button / Esc dismisses only the gallery.
//
// Reads directly from `galleryEntriesAtom` (kept fresh by useGalleryData)
// so newly-rendered exports appear live as their queue jobs complete —
// no close/reopen needed.
export default function GalleryModal() {
  const [modals, setModals] = useAtom(modalsAtom)
  const setLightboxEntry = useSetAtom(lightboxEntryAtom)
  const gallery = useAtomValue(galleryEntriesAtom)
  // Phase 2.5: simplified to a single canonical grid view. The old
  // grid/large/list toggle was rarely used and added clutter.
  const [groupBatches, setGroupBatches] = useState(true)

  const open = modals.gallery

  // Listen for 'open-gallery' window event (dispatched by sidebar / shortcuts).
  useEffect(() => {
    const onOpen = () => setModals((m) => ({ ...m, gallery: true }))
    window.addEventListener('open-gallery', onOpen)
    return () => window.removeEventListener('open-gallery', onOpen)
  }, [setModals])

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

  // Open the lightbox with a SCOPED set of items so prev/next only walks
  // within the user's mental group: a batch (All Styles) browses only its
  // own renders; a singleton browses only other singletons. Mixing them
  // made 'next' surprise-jump from a styled render to an unrelated quick-
  // download or vice versa.
  const openLightboxWith = (items, startIdx) => {
    if (!items?.length) return
    const target = items[startIdx]
    if (!target) return
    // DB is oldest-first, grid is newest-first — reverse so left arrow
    // walks toward newer items and index translates cleanly.
    const display = [...items].reverse()
    const displayStart = items.length - 1 - startIdx
    setLightboxEntry(target)
    window.dispatchEvent(
      new CustomEvent('open-lightbox', {
        detail: { entries: display, startIndex: displayStart },
      }),
    )
    setModals((m) => ({ ...m, lightbox: true })) // keep gallery: true — they stack
  }

  if (!open) return null

  // When grouping is on, buildGalleryEntries collapses batched items
  // into one card. When off, render every item flat (newest first to
  // match the existing reverse-chronological grid order).
  const entries = groupBatches
    ? buildGalleryEntries(gallery)
    : [...gallery].reverse().map((item) => ({ type: 'item', item }))
  const count = gallery.length

  return (
    <div
      className="modal open"
      id="gallery-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Gallery"
    >
      <div className="modal-panel xwide">
        <div className="modal-header gallery-header">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span className="gallery-title">Gallery</span>
            <span className="gallery-count" id="gallery-count">
              {count} image{count !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="gallery-actions">
            <button
              type="button"
              className={'view-toggle gallery-group-toggle' + (groupBatches ? ' active' : '')}
              onClick={() => setGroupBatches((v) => !v)}
              title={groupBatches ? 'Grouping batched renders — click to flatten' : 'Showing every render flat — click to group batches'}
              aria-pressed={groupBatches}
            >
              {groupBatches ? 'Grouped' : 'Flat'}
            </button>
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
              aria-label="Close gallery"
            >
              ×
            </button>
          </div>
        </div>
        <div className="gallery-body">
          {count === 0 ? (
            <div className="gallery-empty">
              <div className="gallery-empty-title">Nothing rendered yet</div>
              <div className="gallery-empty-body">
                Frame a shot, hit Render, and your finished posters will land here.
              </div>
            </div>
          ) : (
          <div className="gallery-grid" id="gallery-grid">
            {entries.map((entry) => {
              if (entry.type === 'item') {
                // Singleton scope = all other singletons (group mode)
                // OR the full gallery (flat mode). The old code always
                // filtered to !batchId, which meant clicking a batched
                // item in flat mode tried to index a batched item in
                // the singletons-only array — got -1, the lightbox
                // bailed silently, and the click "did nothing."
                const scope = groupBatches
                  ? gallery.filter((g) => !g.batchId)
                  : gallery
                const startIdx = scope.indexOf(entry.item)
                return (
                  <GalleryCard
                    key={entry.item.id}
                    item={entry.item}
                    onOpen={() => openLightboxWith(scope, startIdx)}
                  />
                )
              }
              // Batch card: scope is exactly the batch's items. No
              // quick-downloads bleed in; nav stays within the set.
              const batchItems = entry.items.map((b) => b.item)
              return (
                <BatchCard
                  key={entry.batchId}
                  entry={entry}
                  onOpen={() => openLightboxWith(batchItems, 0)}
                />
              )
            })}
          </div>
          )}
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
  const handleShare = async (e) => {
    e.stopPropagation()
    // Phase 7.3 — bake the caption + download + toast. Both the gallery
    // card and the lightbox route through src/lib/share.js so behavior
    // can't drift between callers.
    await shareEntry(item)
  }
  const handleDelete = (e) => {
    e.stopPropagation()
    if (!confirm(`Delete "${item.label}"?`)) return
    window.dispatchEvent(new CustomEvent('gallery-remove', { detail: { id: item.id } }))
  }
  const handleTogglePublic = (e) => {
    e.stopPropagation()
    window.dispatchEvent(new CustomEvent('gallery-toggle-public', {
      detail: { id: item.id, isPublic: !item.isPublic },
    }))
  }
  // Keyboard support for the card itself: Enter / Space opens the
  // lightbox the same way a click does. The card stays a <div role=button>
  // (not a real <button>) because the action chips inside are buttons of
  // their own, and nested <button>s aren't valid HTML.
  const onCardKey = (e) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen?.()
    }
  }
  return (
    <div
      className="gallery-card"
      onClick={onOpen}
      onKeyDown={onCardKey}
      role="button"
      tabIndex={0}
      aria-label={`Open render: ${item.label}`}
    >
      <img src={item.dataUrl} alt={item.label} />
      {item.isPublic && (
        <div className="gc-public-badge" title="Visible on the community page">
          Public
        </div>
      )}
      <button
        type="button"
        className="gc-dl gc-dl-share"
        title="Share to Community"
        aria-label="Share to Community"
        onClick={handleShare}
      >
        {'\u2191'}
      </button>
      <button
        type="button"
        className={`gc-dl gc-dl-public${item.isPublic ? ' is-on' : ''}`}
        title={item.isPublic ? 'Make private' : 'Publish to Community'}
        aria-label={item.isPublic ? 'Make private' : 'Publish to Community'}
        aria-pressed={item.isPublic}
        onClick={handleTogglePublic}
      >
        {item.isPublic ? '\u25c9' : '\u25cb'}
      </button>
      <button
        type="button"
        className="gc-dl gc-dl-download"
        title="Download"
        aria-label="Download"
        onClick={handleDownload}
      >
        {'\u2193'}
      </button>
      <button
        type="button"
        className="gc-dl gc-dl-delete"
        title="Delete"
        aria-label="Delete render"
        onClick={handleDelete}
      >
        {'\u00d7'}
      </button>
      <div className="gc-info">
        <span className="gc-label">{item.label}</span>
        <span className="gc-time">{formatTime(item.time)}</span>
      </div>
    </div>
  )
}

function BatchCard({ entry, onOpen }) {
  const previews = entry.items.slice(0, 4)
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen?.()
    }
  }
  return (
    <div
      className="gallery-card gallery-batch"
      onClick={onOpen}
      onKeyDown={onKey}
      role="button"
      tabIndex={0}
      aria-label={`Open batch: ${entry.label} (${entry.items.length} styles)`}
    >
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
