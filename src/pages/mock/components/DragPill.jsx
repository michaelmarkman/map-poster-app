import { useRef, useState } from 'react'

// Drag-on-pill scrubber.
//
// Phase 12 — full prototype scrub-state morph:
//   - rest: LABEL value (two-slot, just like Pill's two-slot recipe)
//   - hover: hairline chartreuse scrub-track rail below the pill
//   - dragging: pill goes opaque (drops backdrop-filter — critical
//     perf fix per the prototype comment: filter invalidation on every
//     value tick was the source of "value lags cursor"), .value-stack
//     hides, two ‹ › chevrons flank an unlabeled value, floating
//     scrub-tooltip pops above with the full LABEL VALUE readout
//
// Rather than compose Pill (which can't easily host the extra DOM the
// scrub state needs), DragPill renders its own .mock-pill button
// directly. All the chassis CSS still applies — only the children
// structure differs from the two-slot Pill.
//
// pointerdown captures pointer; pointermove maps Δx to a value change
// via `scale` (units per pixel). 3px threshold separates click vs
// drag — caller can pass `onClick` for the click case.
export default function DragPill({
  icon,
  label,
  value,
  setValue,
  min,
  max,
  scale,
  format,
  onClick,
  // Optional shift-modifier hook (called once on pointerdown if
  // shiftKey is held). Used by the time-of-day scrub to unlock the
  // sunrise/sunset clamp before the drag math kicks in.
  onShiftDrag,
  className = '',
  ...rest
}) {
  const startRef = useRef({ x: 0, v: 0, dragging: false, moved: false })
  const [dragging, setDragging] = useState(false)

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    if (onShiftDrag && e.shiftKey) onShiftDrag()
    startRef.current = {
      x: e.clientX,
      v: value,
      dragging: true,
      moved: false,
    }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    const s = startRef.current
    if (!s.dragging) return
    const dx = e.clientX - s.x
    if (!s.moved && Math.abs(dx) < 3) return
    s.moved = true
    const next = Math.max(min, Math.min(max, s.v + dx * scale))
    setValue(next)
  }
  const onPointerUp = (e) => {
    const s = startRef.current
    s.dragging = false
    setDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
    if (!s.moved && onClick) onClick(e)
  }

  const formatted = format(value)
  return (
    <button
      type="button"
      className={`mock-pill is-drag${dragging ? ' is-dragging' : ''}${className ? ' ' + className : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => e.preventDefault()}
      {...rest}
    >
      {icon ? <span className="mock-pill-icon">{icon}</span> : null}
      {/* Rest-state stack — label + value side by side. Hidden during
       * scrub via CSS so the chevrons + tooltip can take over the
       * pill's interior without DOM swaps. */}
      <span className="mock-pill-stack">
        {label != null && (
          <span className="mock-pill-label">{label}</span>
        )}
        <span className="mock-pill-value">{formatted}</span>
      </span>
      {/* Scrub-state chevrons — two drag-direction hints flanking the
       * value when actively dragging. */}
      <span className="mock-pill-chevrons" aria-hidden="true">
        <span className="mock-pill-chev">
          <svg viewBox="0 0 10 10" fill="none" stroke="currentColor"
               strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 1.5L1.5 5L6 8.5" />
          </svg>
        </span>
        <span className="mock-pill-scrub-value">{formatted}</span>
        <span className="mock-pill-chev">
          <svg viewBox="0 0 10 10" fill="none" stroke="currentColor"
               strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 1.5L8.5 5L4 8.5" />
          </svg>
        </span>
      </span>
      {/* Floating tooltip above the pill — shows the LABEL on top + the
       * VALUE on the same row, so the user always knows WHICH
       * parameter they're scrubbing even when the in-pill label
       * disappears. Position: above the pill via bottom: calc(100% +
       * 8px). Hidden via CSS at rest. */}
      <span className="mock-pill-tooltip" aria-hidden="true">
        {label != null && (
          <span className="mock-pill-tooltip-label">{label}</span>
        )}
        <span className="mock-pill-tooltip-value">{formatted}</span>
      </span>
    </button>
  )
}
