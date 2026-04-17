import { useCallback, useEffect, useRef, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { modalsAtom, lightboxEntryAtom, shareDraftAtom } from '../atoms/modals'

// Ported from prototypes/poster-v3-ui.html (lines 2691-2709) and the handlers
// around poster-v3-ui.jsx:2767-2998. The prototype used a global `gallery`
// array indexed by lbIdx; here we hold the entry list + current index in
// local state, seeded via an 'open-lightbox' event or the lightboxEntryAtom.
export default function Lightbox() {
  const [modals, setModals] = useAtom(modalsAtom)
  const entryFromAtom = useAtomValue(lightboxEntryAtom)
  const setShareDraft = useSetAtom(shareDraftAtom)

  // Local list of entries + current index. Populated either by the
  // 'open-lightbox' event (preferred — supplies the full list so prev/next
  // work) or, as a fallback, by reading lightboxEntryAtom for a single item.
  const [entries, setEntries] = useState([])
  const [index, setIndex] = useState(0)

  const open = modals.lightbox
  const entry = entries[index] || entryFromAtom || null
  const total = entries.length

  const closeSelf = useCallback(() => {
    setModals(m => ({ ...m, lightbox: false }))
  }, [setModals])

  // Seed entries from the custom event so arrow navigation works.
  useEffect(() => {
    const onOpen = (e) => {
      const detail = e?.detail || {}
      const list = Array.isArray(detail.entries) ? detail.entries : []
      const start = Math.max(0, Math.min(list.length - 1, detail.startIndex | 0))
      setEntries(list)
      setIndex(list.length ? start : 0)
    }
    window.addEventListener('open-lightbox', onOpen)
    return () => window.removeEventListener('open-lightbox', onOpen)
  }, [])

  // If the lightbox opens with no entry list but we have a single atom entry,
  // fall back to that (single-item view, no prev/next).
  useEffect(() => {
    if (!open) return
    if (entries.length === 0 && entryFromAtom) {
      setEntries([entryFromAtom])
      setIndex(0)
    }
  }, [open, entryFromAtom, entries.length])

  // Reset local state when the modal closes so the next open starts clean.
  useEffect(() => {
    if (!open) {
      setEntries([])
      setIndex(0)
    }
  }, [open])

  const canPrev = index > 0
  const canNext = index < total - 1

  const goPrev = useCallback(() => {
    if (canPrev) setIndex(i => i - 1)
  }, [canPrev])
  const goNext = useCallback(() => {
    if (canNext) setIndex(i => i + 1)
  }, [canNext])

  // ── Swipe carousel (coarse-pointer only) ──────────────────────────
  // Horizontal drag on the image translates it in real time; release past
  // a 60px threshold triggers prev/next. Below threshold the image snaps
  // back. Ignored on fine pointers (mouse/trackpad) — those users have
  // the arrow keys + on-screen prev/next buttons.
  const SWIPE_THRESHOLD = 60
  const [dragDx, setDragDx] = useState(0)
  const imgRef = useRef(null)
  const isCoarse = typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(pointer: coarse)').matches

  // Attach touch handlers as native (non-passive) listeners so the
  // touchmove handler can call preventDefault to stop horizontal rubber-
  // band while tracking the finger. React's synthetic touchmove is
  // passive by default, which would make preventDefault a no-op.
  useEffect(() => {
    if (!open || !isCoarse) return
    const img = imgRef.current
    if (!img) return
    const state = { active: false, startX: 0, startY: 0, dx: 0 }
    const onStart = (e) => {
      const t = e.touches && e.touches[0]
      if (!t) return
      state.active = true
      state.startX = t.clientX
      state.startY = t.clientY
      state.dx = 0
    }
    const onMove = (e) => {
      if (!state.active) return
      const t = e.touches && e.touches[0]
      if (!t) return
      const dx = t.clientX - state.startX
      const dy = t.clientY - state.startY
      // Mostly-vertical gestures: bail so native scroll still works.
      if (Math.abs(dy) > Math.abs(dx) * 1.2) {
        state.active = false
        setDragDx(0)
        return
      }
      // Resist past first/last so the image doesn't fly into empty space.
      let adjusted = dx
      if ((!canPrev && dx > 0) || (!canNext && dx < 0)) adjusted = dx * 0.35
      state.dx = adjusted
      setDragDx(adjusted)
      if (e.cancelable) e.preventDefault()
    }
    const onEnd = () => {
      if (!state.active) return
      state.active = false
      const dx = state.dx
      setDragDx(0)
      if (dx <= -SWIPE_THRESHOLD && canNext) goNext()
      else if (dx >= SWIPE_THRESHOLD && canPrev) goPrev()
    }
    img.addEventListener('touchstart', onStart, { passive: true })
    img.addEventListener('touchmove', onMove, { passive: false })
    img.addEventListener('touchend', onEnd)
    img.addEventListener('touchcancel', onEnd)
    return () => {
      img.removeEventListener('touchstart', onStart)
      img.removeEventListener('touchmove', onMove)
      img.removeEventListener('touchend', onEnd)
      img.removeEventListener('touchcancel', onEnd)
    }
  }, [open, isCoarse, canPrev, canNext, goPrev, goNext])

  const downloadCurrent = useCallback(() => {
    if (!entry?.dataUrl) return
    const link = document.createElement('a')
    link.download = (entry.filename || entry.label || 'poster') + '.png'
    link.href = entry.dataUrl
    link.click()
  }, [entry])

  // Keyboard: Left/Right navigate, Esc closes, Cmd/Ctrl+S downloads.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') { closeSelf(); return }
      if (e.key === 'ArrowLeft' && canPrev) { goPrev(); return }
      if (e.key === 'ArrowRight' && canNext) { goNext(); return }
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        downloadCurrent()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, canPrev, canNext, goPrev, goNext, closeSelf, downloadCurrent])

  // Backdrop click closes (mirrors prototype: click on #lightbox itself).
  const rootRef = useRef(null)
  const onBackdropClick = (e) => {
    if (e.target === rootRef.current) closeSelf()
  }

  // Action handlers. Each dispatches a window event so the editor-level
  // handlers (still to be wired) can observe and act, and updates atoms
  // where that's the agreed-on data flow.
  const onShare = (e) => {
    e.stopPropagation()
    if (!entry) return
    window.dispatchEvent(new CustomEvent('lightbox-share', { detail: entry }))
    setShareDraft({
      title: '',
      description: '',
      location: '',
      entryId: entry.id ?? null,
    })
    setModals(m => ({ ...m, share: true }))
  }

  const onJumpView = (e) => {
    e.stopPropagation()
    if (!entry) return
    window.dispatchEvent(new CustomEvent('lightbox-jump-view', { detail: entry }))
  }

  const onSaveView = (e) => {
    e.stopPropagation()
    if (!entry) return
    window.dispatchEvent(new CustomEvent('lightbox-save-view', { detail: entry }))
  }

  const onPreviewAsPoster = (e) => {
    e.stopPropagation()
    if (!entry) return
    window.dispatchEvent(new CustomEvent('open-poster-preview', {
      detail: {
        imageSrc: entry.dataUrl,
        label: entry.label,
        entryId: entry.id ?? null,
      },
    }))
    setModals(m => ({ ...m, posterPreview: true }))
  }

  const onDownload = (e) => {
    e.stopPropagation()
    downloadCurrent()
  }

  const onPrevClick = (e) => { e.stopPropagation(); goPrev() }
  const onNextClick = (e) => { e.stopPropagation(); goNext() }
  const onCloseClick = (e) => { e.stopPropagation(); closeSelf() }

  if (!open) return null

  const hasView = !!entry?.view
  const label = entry?.label || ''
  const positionSuffix = total > 1 ? ` (${index + 1}/${total})` : ''

  return (
    <div
      id="lightbox"
      ref={rootRef}
      className="open"
      onClick={onBackdropClick}
    >
      <button
        className="lb-nav prev"
        id="lb-prev"
        type="button"
        onClick={onPrevClick}
        disabled={!canPrev}
        style={{ visibility: canPrev ? 'visible' : 'hidden' }}
      >
        ‹
      </button>
      <button
        className="lb-nav next"
        id="lb-next"
        type="button"
        onClick={onNextClick}
        disabled={!canNext}
        style={{ visibility: canNext ? 'visible' : 'hidden' }}
      >
        ›
      </button>
      <button
        className="modal-close lb-close"
        id="lb-close"
        type="button"
        onClick={onCloseClick}
      >
        ×
      </button>

      <div className="lb-actions" id="lb-actions">
        <button
          className="gallery-btn lb-download"
          id="lb-share"
          type="button"
          onClick={onShare}
        >
          Share
        </button>
        <button
          className="gallery-btn lb-download"
          id="lb-jump-view"
          type="button"
          onClick={onJumpView}
          disabled={!hasView}
          title={hasView
            ? 'Jump to the camera view and settings this was rendered from'
            : 'No view data saved for this render'}
        >
          Jump to view
        </button>
        <button
          className="gallery-btn lb-download"
          id="lb-save-view"
          type="button"
          onClick={onSaveView}
          disabled={!hasView}
          title={hasView
            ? 'Save this view to your saved-views list'
            : 'No view data saved for this render'}
        >
          Save view
        </button>
        <button
          className="gallery-btn lb-download"
          id="lb-frame"
          type="button"
          onClick={onPreviewAsPoster}
          title="Preview this render inside a physical poster frame mockup"
        >
          Preview as poster
        </button>
        {/* TODO: overflow menu is populated imperatively in the prototype —
            on narrow viewports Share / Jump to view / Save view get moved
            into .lb-more-menu. Left empty here; will be wired in a later
            phase when the responsive JS is ported. */}
        <div className="lb-more" id="lb-more" style={{ display: 'none' }}>
          <button
            className="lb-more-btn"
            id="lb-more-btn"
            type="button"
            aria-label="More actions"
            aria-expanded="false"
          >
            ⋯
          </button>
          <div className="lb-more-menu" id="lb-more-menu"></div>
        </div>
        <button
          className="gallery-btn accent lb-download"
          id="lb-download"
          type="button"
          onClick={onDownload}
        >
          Download
        </button>
      </div>

      <img
        id="lb-img"
        ref={imgRef}
        src={entry?.dataUrl || ''}
        alt={label}
        style={{
          transform: dragDx ? `translateX(${dragDx}px)` : undefined,
          // Snap back smoothly once the finger lifts; while dragging we
          // skip the transition so the image tracks the finger 1:1.
          transition: dragDx ? 'none' : 'transform 0.2s ease',
          touchAction: isCoarse ? 'pan-y' : undefined,
        }}
      />
      <div className="lb-label" id="lb-label">
        {label + positionSuffix}
      </div>
    </div>
  )
}
