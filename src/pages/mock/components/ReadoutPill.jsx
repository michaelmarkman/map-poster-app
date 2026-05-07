import { useRef, useState } from 'react'

// Multi-segment readout pill — visually one glass surface with hairline
// dividers between drag-scrubber segments. Each segment manages its own
// pointerdown→capture→pointermove→pointerup lifecycle and writes to its
// own atom.
//
// Each `segments` entry shape:
//   {
//     key: string,             // stable key for React + aria
//     label: string,           // accessibility label, e.g. "Focal length"
//     value: number,           // current numeric value (the atom's current value)
//     setValue: (n) => void,   // commit handler; receives the next clamped value
//     min: number,
//     max: number,
//     scale: number,           // units per pixel of horizontal drag
//     format: (n) => string,   // renders the readout string (e.g. "35mm")
//     onShiftDrag?: () => void,// optional: called once on pointerdown if shiftKey
//   }
//
// The drag math + click-vs-drag threshold mirrors DragPill (3px), so the
// per-segment behaviour stays consistent with the rest of the cluster
// surface. Touch-action: none on the wrapper keeps mobile scrolling from
// stealing the horizontal drag.

function Segment({ segment, isLast }) {
  const startRef = useRef({ x: 0, v: 0, dragging: false, moved: false, pointerId: 0 })
  const [dragging, setDragging] = useState(false)

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    if (segment.onShiftDrag && e.shiftKey) {
      // Fire the shift-modifier hook so a caller can flip todUnlocked etc.
      // before any drag math runs — the value commit below uses the
      // post-hook clamp range.
      segment.onShiftDrag()
    }
    startRef.current = {
      x: e.clientX,
      v: segment.value,
      dragging: true,
      moved: false,
      pointerId: e.pointerId,
    }
    setDragging(true)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
  }
  const onPointerMove = (e) => {
    const s = startRef.current
    if (!s.dragging || e.pointerId !== s.pointerId) return
    const dx = e.clientX - s.x
    if (!s.moved && Math.abs(dx) < 3) return
    s.moved = true
    const next = Math.max(segment.min, Math.min(segment.max, s.v + dx * segment.scale))
    segment.setValue(next)
  }
  const onPointerUp = (e) => {
    const s = startRef.current
    if (e.pointerId !== s.pointerId) return
    s.dragging = false
    setDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
  }

  return (
    <button
      type="button"
      aria-label={`${segment.label} ${segment.format(segment.value)}, drag to change`}
      className={`mock-readout-segment${dragging ? ' is-dragging' : ''}${isLast ? '' : ' has-divider'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => e.preventDefault()}
    >
      {segment.format(segment.value)}
    </button>
  )
}

export default function ReadoutPill({ segments, className = '' }) {
  return (
    <div
      className={`mock-readout-pill${className ? ' ' + className : ''}`}
      role="group"
      aria-label="Camera readout"
    >
      {segments.map((seg, i) => (
        <Segment key={seg.key} segment={seg} isLast={i === segments.length - 1} />
      ))}
    </div>
  )
}
