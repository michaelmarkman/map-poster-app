import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { modalsAtom, lightboxEntryAtom } from '../atoms/modals'
import { shareEntry } from '../../../lib/share'
import { MODIFIER_BY_KEY } from '../../../data/promptModifiers'

// Where to truncate the prompt panel's preview before showing the
// "Expand" button. ~120 chars fits 2 lines at 10/1.5 mono in the 264px
// sidebar without spilling.
const PROMPT_PREVIEW_LEN = 120

// Map a numeric w/h aspect to a familiar label. Anything that doesn't
// match a known ratio (within 1%) falls back to "w.ww:1" rounded to
// two decimals. Used by the Lightbox meta-list.
const KNOWN_ASPECTS = [
  { label: '1:1',  ratio: 1 / 1 },
  { label: '4:5',  ratio: 4 / 5 },
  { label: '3:4',  ratio: 3 / 4 },
  { label: '2:3',  ratio: 2 / 3 },
  { label: '9:16', ratio: 9 / 16 },
  { label: '5:4',  ratio: 5 / 4 },
  { label: '4:3',  ratio: 4 / 3 },
  { label: '3:2',  ratio: 3 / 2 },
  { label: '16:9', ratio: 16 / 9 },
]
export function aspectLabel(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return null
  for (const a of KNOWN_ASPECTS) {
    if (Math.abs(a.ratio - ratio) / a.ratio < 0.01) return a.label
  }
  return ratio >= 1
    ? `${ratio.toFixed(2)}:1`
    : `1:${(1 / ratio).toFixed(2)}`
}

// Ported from prototypes/poster-v3-ui.html (lines 2691-2709) and the handlers
// around poster-v3-ui.jsx:2767-2998. The prototype used a global `gallery`
// array indexed by lbIdx; here we hold the entry list + current index in
// local state, seeded via an 'open-lightbox' event or the lightboxEntryAtom.
export default function Lightbox() {
  const [modals, setModals] = useAtom(modalsAtom)
  const entryFromAtom = useAtomValue(lightboxEntryAtom)

  // Local list of entries + current index. Populated either by the
  // 'open-lightbox' event (preferred — supplies the full list so prev/next
  // work) or, as a fallback, by reading lightboxEntryAtom for a single item.
  const [entries, setEntries] = useState([])
  const [index, setIndex] = useState(0)
  // Image-stage view mode. 'render' is the AI result (default), 'raw'
  // is the pre-AI photogrammetry snapshot, 'compare' is the slider.
  // Reset to 'render' whenever the entry changes (next/prev nav) so the
  // user doesn't carry a Compare state into a new image.
  const [viewMode, setViewMode] = useState('render')
  const [showFullPrompt, setShowFullPrompt] = useState(false)

  const open = modals.lightbox
  const entry = entries[index] || entryFromAtom || null
  const total = entries.length

  // Reset toolbar / prompt-expand state whenever the entry changes.
  useEffect(() => {
    setViewMode('render')
    setShowFullPrompt(false)
  }, [entry?.id])

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

  // When the lightbox is open AND the poster-preview is also open,
  // flipping prev/next should update the preview to the new entry.
  // GUARD: only re-dispatch when the lightbox itself is open. Previously
  // the effect fired whenever modals.posterPreview flipped on — which
  // included the 'toggle preview from the canvas' case — and overwrote
  // the canvas snapshot with the last lightbox entry's image.
  const currentEntry = entries[index] || entryFromAtom || null
  useEffect(() => {
    if (!open) return
    if (!modals.posterPreview) return
    if (!currentEntry?.dataUrl) return
    window.dispatchEvent(new CustomEvent('open-poster-preview', {
      detail: {
        imageSrc: currentEntry.dataUrl,
        label: currentEntry.label,
        entryId: currentEntry.id ?? null,
      },
    }))
  }, [open, currentEntry, modals.posterPreview])

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

  // Keyboard: Left/Right navigate, Esc closes (or exits Compare mode
  // first), Cmd/Ctrl+S downloads, R toggles Render ↔ Raw, C toggles
  // Compare mode.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      // Ignore when the user is typing into an input/textarea/etc.
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'Escape') {
        if (viewMode === 'compare') { setViewMode('render'); return }
        closeSelf()
        return
      }
      if (e.key === 'ArrowLeft' && canPrev) { goPrev(); return }
      if (e.key === 'ArrowRight' && canNext) { goNext(); return }
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        downloadCurrent()
        return
      }
      if (e.key === 'r' || e.key === 'R') {
        setViewMode((m) => (m === 'raw' ? 'render' : 'raw'))
        return
      }
      if (e.key === 'c' || e.key === 'C') {
        setViewMode((m) => (m === 'compare' ? 'render' : 'compare'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, canPrev, canNext, goPrev, goNext, closeSelf, downloadCurrent, viewMode])

  // Backdrop click closes (mirrors prototype: click on #lightbox itself).
  const rootRef = useRef(null)
  const onBackdropClick = (e) => {
    if (e.target === rootRef.current) closeSelf()
  }

  // Action handlers. Each dispatches a window event so the editor-level
  // handlers (still to be wired) can observe and act, and updates atoms
  // where that's the agreed-on data flow.
  const onShare = async (e) => {
    e.stopPropagation()
    if (!entry) return
    // Same flow as the gallery-card Share button (Phase 7.3) —
    // both route through src/lib/share.js so behavior stays in lockstep.
    // The modals.share + shareDraftAtom scaffolding from before this
    // helper used to silently flip a flag with no consumer.
    await shareEntry(entry)
  }

  const onJumpView = (e) => {
    e.stopPropagation()
    if (!entry) return
    window.dispatchEvent(new CustomEvent('lightbox-jump-view', { detail: entry }))
    // Close both lightbox + gallery so the user can see the scene they
    // just jumped to without dismissing modals manually.
    setModals(m => ({ ...m, lightbox: false, gallery: false }))
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

  const onDelete = (e) => {
    e.stopPropagation()
    if (!entry) return
    if (!window.confirm(`Delete "${entry.label || 'this render'}"?`)) return
    window.dispatchEvent(
      new CustomEvent('gallery-remove', { detail: { id: entry.id } }),
    )
    // Close the lightbox — caller scopes the list, so the next index
    // would be stale anyway after the entry is removed.
    closeSelf()
  }

  const onPrevClick = (e) => { e.stopPropagation(); goPrev() }
  const onNextClick = (e) => { e.stopPropagation(); goNext() }
  const onCloseClick = (e) => { e.stopPropagation(); closeSelf() }

  // Modifier labels for the chips row — read from the registry so
  // labels are user-facing strings, not raw keys. useMemo MUST run
  // before the early return below; rules-of-hooks requires hooks to
  // be called in the same order every render.
  const modifierLabels = useMemo(() => {
    if (!Array.isArray(entry?.modifiers)) return []
    return entry.modifiers
      .map((k) => MODIFIER_BY_KEY[k]?.label)
      .filter(Boolean)
  }, [entry?.modifiers])

  if (!open) return null

  const hasView = !!entry?.view
  const label = entry?.label || ''
  const positionSuffix = total > 1 ? ` (${index + 1}/${total})` : ''

  // Raw / Compare gating — the toolbar + Compare slider only make
  // sense for entries that carry a distinct pre-AI snapshot. Non-AI
  // raw exports stash rawSnapshot === dataUrl (or null on legacy
  // rows); either way there's no diff to surface.
  const hasRaw = !!entry?.rawSnapshot && entry.rawSnapshot !== entry?.dataUrl
  const effectiveMode = hasRaw ? viewMode : 'render'
  const imageSrc = effectiveMode === 'raw' ? entry?.rawSnapshot : entry?.dataUrl

  // Prompt truncation — chars not words so the cut is predictable.
  const promptText = entry?.prompt || ''
  const promptIsLong = promptText.length > PROMPT_PREVIEW_LEN
  const promptPreview = promptIsLong
    ? promptText.slice(0, PROMPT_PREVIEW_LEN).trimEnd() + '…'
    : promptText

  // Metadata table values, derived from the entry. Each row only
  // renders if it has data — useQueue's enrichViewWithCaptureContext
  // populates these on new entries; legacy entries simply skip rows.
  const captured = entry?.time
    ? (typeof entry.time === 'number' ? new Date(entry.time) : entry.time)
    : null
  const capturedStr = captured
    ? captured.toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : null
  // Lens line: focal length + aperture combined into one row so the
  // user reads it as a single camera setting ("35mm · f/2.8").
  const fovMm = entry?.view?.fovMm
  const aperture = entry?.view?.aperture
  const lensParts = []
  if (Number.isFinite(fovMm) && fovMm > 0) lensParts.push(`${Math.round(fovMm)}mm`)
  if (Number.isFinite(aperture) && aperture > 0) {
    // f/X.Y — one decimal under f/10, integer at and above.
    lensParts.push(aperture < 10 ? `f/${aperture.toFixed(1)}` : `f/${Math.round(aperture)}`)
  }
  const lensStr = lensParts.length > 0 ? lensParts.join(' · ') : null

  const todHour = entry?.view?.tod
  const todStr = Number.isFinite(todHour)
    ? (() => {
        const hh = Math.floor(todHour)
        const mm = Math.round((todHour - hh) * 60)
        const ap = hh >= 12 ? 'pm' : 'am'
        const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
        return `${h12}:${String(mm).padStart(2, '0')}${ap}`
      })()
    : null

  // Aspect: a decimal ratio (w/h). Show common ones as named labels
  // (1:1, 3:4, 4:3, 16:9, …) and anything custom as "w.ww:1".
  const aspect = entry?.view?.aspect
  const aspectStr = entry?.view?.fillMode
    ? 'Fill'
    : (Number.isFinite(aspect) && aspect > 0 ? aspectLabel(aspect) : null)

  // Resolution: multiplier × pixel height (matching the Capture
  // segmented control). 1×=1080, 2×=2160, 3×=3240, 4×=4320.
  const resMul = entry?.view?.resolution
  const RES_PX = { 1: 1080, 2: 2160, 3: 3240, 4: 4320 }
  const resStr = Number.isFinite(resMul) && RES_PX[resMul]
    ? `${resMul}× · ${RES_PX[resMul]}px`
    : (Number.isFinite(resMul) ? `${resMul}×` : null)

  return (
    <div
      id="lightbox"
      ref={rootRef}
      className="open"
      role="dialog"
      aria-modal="true"
      aria-label={label ? `Render: ${label}` : 'Render preview'}
      onClick={onBackdropClick}
    >
      <button
        className="lb-nav prev"
        id="lb-prev"
        type="button"
        onClick={onPrevClick}
        disabled={!canPrev}
        style={{ visibility: canPrev ? 'visible' : 'hidden' }}
        aria-label="Previous render"
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
        aria-label="Next render"
      >
        ›
      </button>
      {/* Render / Raw / Compare toolbar — only when the entry carries
       *  a distinct pre-AI snapshot (AI renders only; non-AI raw
       *  exports + legacy entries skip the toolbar entirely). */}
      {hasRaw && (
        <div className="lb-toolbar" role="group" aria-label="View mode">
          {['render', 'raw', 'compare'].map((m) => (
            <button
              key={m}
              type="button"
              className={`lb-toolbar-btn${effectiveMode === m ? ' is-active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setViewMode(m) }}
              title={
                m === 'render' ? 'AI-rendered image (shortcut: R)' :
                m === 'raw'    ? 'Underlying photogrammetry snapshot (R)' :
                                  'Side-by-side comparison slider (C)'
              }
              aria-pressed={effectiveMode === m}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {effectiveMode === 'compare' ? (
        <CompareSlider rendered={entry?.dataUrl} raw={entry?.rawSnapshot} />
      ) : (
        <img
          id="lb-img"
          ref={imgRef}
          src={imageSrc || undefined}
          alt={label || 'Render'}
          // Browsers default img to draggable=true, which intercepts the
          // touch carousel's gesture and lets the user drag the image OUT
          // of the modal as a file. Off entirely.
          draggable={false}
          style={{
            transform: dragDx ? `translateX(${dragDx}px)` : undefined,
            // Snap back smoothly once the finger lifts; while dragging we
            // skip the transition so the image tracks the finger 1:1.
            transition: dragDx ? 'none' : 'transform 0.2s ease',
            touchAction: isCoarse ? 'pan-y' : undefined,
          }}
        />
      )}

      {/* Phase 21 audit — real flex-column sidebar mirroring the
       *  prototype's `.lightbox-side`. Replaces the fragile absolute-
       *  margin layout (close, label, actions, meta, danger all
       *  positioned by manual margin-top from the column edge). With
       *  a real container, children stack with gap: 24px and the
       *  footer-danger glues to the bottom via margin-top: auto. */}
      <aside className="lb-side" onClick={(e) => e.stopPropagation()}>
        <div className="lb-close-row">
          <button
            className="modal-close lb-close"
            id="lb-close"
            type="button"
            onClick={onCloseClick}
            aria-label="Close lightbox"
          >
            ×
          </button>
        </div>

        <div className="lb-head">
          <span className="lb-label" id="lb-label">
            {label + positionSuffix}
          </span>
        </div>

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
          <button
            className="gallery-btn accent lb-download"
            id="lb-download"
            type="button"
            onClick={onDownload}
          >
            Download
          </button>
        </div>

        {(label || capturedStr || lensStr || todStr || aspectStr || resStr) && (
          <div className="lb-meta-list">
            {label && (
              <div className="lb-meta-row">
                <span className="lb-meta-key">Style</span>
                <span className="lb-meta-val">{label}</span>
              </div>
            )}
            {capturedStr && (
              <div className="lb-meta-row">
                <span className="lb-meta-key">Captured</span>
                <span className="lb-meta-val">{capturedStr}</span>
              </div>
            )}
            {lensStr && (
              <div className="lb-meta-row">
                <span className="lb-meta-key">Lens</span>
                <span className="lb-meta-val">{lensStr}</span>
              </div>
            )}
            {aspectStr && (
              <div className="lb-meta-row">
                <span className="lb-meta-key">Aspect</span>
                <span className="lb-meta-val">{aspectStr}</span>
              </div>
            )}
            {resStr && (
              <div className="lb-meta-row">
                <span className="lb-meta-key">Resolution</span>
                <span className="lb-meta-val">{resStr}</span>
              </div>
            )}
            {todStr && (
              <div className="lb-meta-row">
                <span className="lb-meta-key">Time of day</span>
                <span className="lb-meta-val">{todStr}</span>
              </div>
            )}
          </div>
        )}

        {/* Modifiers chips — read-only display of the modifier keys
         *  that were active when this still was queued. Hidden on
         *  non-AI / legacy entries (entry.modifiers === null) and on
         *  AI entries that just happened to have zero modifiers. */}
        {modifierLabels.length > 0 && (
          <div className="lb-mods-row">
            <span className="lb-mods-row-label">Modifiers</span>
            <div className="lb-mods-row-chips">
              {modifierLabels.map((lbl) => (
                <span key={lbl} className="lb-mods-row-chip">{lbl}</span>
              ))}
            </div>
          </div>
        )}

        {/* Prompt panel — truncated to PROMPT_PREVIEW_LEN chars with an
         *  Expand toggle. Hidden when entry.prompt is null (non-AI /
         *  legacy entries). */}
        {promptText && (
          <div className="lb-prompt-row">
            <span className="lb-prompt-row-label">Prompt</span>
            <span className="lb-prompt-row-body">
              {showFullPrompt ? promptText : promptPreview}
            </span>
            {promptIsLong && (
              <button
                type="button"
                className="lb-prompt-row-toggle"
                onClick={() => setShowFullPrompt((v) => !v)}
              >
                {showFullPrompt ? 'Collapse' : 'Expand'}
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          className="lb-danger"
          onClick={onDelete}
          aria-label="Delete this render"
        >
          <svg viewBox="0 0 11 11" aria-hidden="true">
            <path d="M3 4h5M3.5 4v5.5M7.5 4v5.5M3 4l.5-1.5h4l.5 1.5"
                  fill="none" stroke="currentColor" strokeWidth="1.4"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Delete</span>
        </button>
      </aside>

      {total > 1 && (
        <div className="lb-strip" onClick={(e) => e.stopPropagation()}>
          {entries.map((e, i) => (
            <button
              key={e.id ?? i}
              type="button"
              className={`lb-thumb${i === index ? ' active' : ''}`}
              onClick={(ev) => { ev.stopPropagation(); setIndex(i) }}
              title={e.label || ''}
              aria-label={`Jump to ${e.label || 'poster'} ${i + 1} of ${total}`}
              aria-current={i === index ? 'true' : undefined}
            >
              <img src={e.dataUrl} alt="" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── CompareSlider ────────────────────────────────────────────────
// Two images stacked at the same size; the TOP image (rendered) is
// clipped via clip-path so the BOTTOM image (raw) shows through on
// one side of the divider. The divider position (pct) is driven by
// pointer/touch on the container. Orientation auto-picks vertical
// vs. horizontal based on the rendered image's natural aspect:
//   - tall portrait → horizontal slider (drag up/down)
//   - wide / square  → vertical slider (drag left/right)
//
// No external dependency; pointer events handle mouse + touch + pen
// uniformly. Pattern lifted from the DragPill scrub flow.
export function clampPct(value) {
  if (!Number.isFinite(value)) return 50
  return Math.max(0, Math.min(100, value))
}

export function computeSliderPct({ orientation, rect, clientX, clientY }) {
  if (!rect || rect.width === 0 || rect.height === 0) return 50
  const raw = orientation === 'horizontal'
    ? ((clientY - rect.top) / rect.height) * 100
    : ((clientX - rect.left) / rect.width) * 100
  return clampPct(raw)
}

function CompareSlider({ rendered, raw }) {
  const [pct, setPct] = useState(50)
  const [orientation, setOrientation] = useState('vertical')
  const containerRef = useRef(null)
  const draggingRef = useRef(false)

  // Detect orientation from the rendered image's natural dimensions
  // once it loads. portrait (h > w) → horizontal slider. Default to
  // vertical while loading since the editor's typical aspect is 3:4
  // or 4:3 — vertical works for both.
  const onRenderedLoad = useCallback((e) => {
    const img = e.currentTarget
    if (!img || !img.naturalWidth || !img.naturalHeight) return
    setOrientation(img.naturalHeight > img.naturalWidth ? 'horizontal' : 'vertical')
  }, [])

  // Pointer-down on the container starts a drag; move + up are bound
  // to the window so the user can drag past the container's edges
  // without losing the gesture.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onMove = (e) => {
      if (!draggingRef.current) return
      const rect = el.getBoundingClientRect()
      setPct(computeSliderPct({
        orientation,
        rect,
        clientX: e.clientX,
        clientY: e.clientY,
      }))
    }
    const onUp = () => { draggingRef.current = false }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [orientation])

  const onPointerDown = (e) => {
    e.stopPropagation()
    draggingRef.current = true
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setPct(computeSliderPct({
      orientation,
      rect,
      clientX: e.clientX,
      clientY: e.clientY,
    }))
  }

  // clip-path: inset(top right bottom left) — clip the TOP (rendered)
  // image so only the "shown" side of the divider is visible.
  //   vertical (drag X): hide the RIGHT (100-pct)% so the rendered
  //                       image fills the LEFT pct%
  //   horizontal (drag Y): hide the BOTTOM (100-pct)% so the rendered
  //                        image fills the TOP pct%
  const topClip = orientation === 'horizontal'
    ? `inset(0 0 ${100 - pct}% 0)`
    : `inset(0 ${100 - pct}% 0 0)`
  const handleStyle = orientation === 'horizontal'
    ? { top: `${pct}%` }
    : { left: `${pct}%` }
  const gripStyle = orientation === 'horizontal'
    ? { top: `${pct}%`, left: '50%', transform: 'translate(-50%, -50%)' }
    : { left: `${pct}%`, top: '50%', transform: 'translate(-50%, -50%)' }

  return (
    <div
      id="lb-img"
      className="lb-compare"
      data-orient={orientation}
      ref={containerRef}
      onPointerDown={onPointerDown}
    >
      {/* Bottom layer — raw snapshot. Drives the container's intrinsic
       *  sizing so both images share the same bounding box. */}
      <img
        className="lb-compare-bottom"
        src={raw}
        alt="Raw snapshot"
        draggable={false}
      />
      {/* Top layer — AI render, clipped to the visible portion. */}
      <img
        className="lb-compare-top"
        src={rendered}
        alt="AI render"
        draggable={false}
        style={{ clipPath: topClip, WebkitClipPath: topClip }}
        onLoad={onRenderedLoad}
      />
      <div className="lb-compare-handle" style={handleStyle} aria-hidden="true" />
      <div className="lb-compare-grip" style={gripStyle} aria-hidden="true">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          {orientation === 'horizontal' ? (
            <path d="M3 6h10M3 10h10" fill="none" stroke="currentColor"
                  strokeWidth="1.4" strokeLinecap="round" />
          ) : (
            <path d="M6 3v10M10 3v10" fill="none" stroke="currentColor"
                  strokeWidth="1.4" strokeLinecap="round" />
          )}
        </svg>
      </div>
    </div>
  )
}
