import { useRef, useState } from 'react'
import Pill from './Pill'

// Drag-on-pill scrubber. pointerdown captures pointer; pointermove maps Δx
// to a value change via `scale` (units per pixel). 3px threshold separates
// click vs drag — caller can pass onClick for the click case.
//
// Phase 6 — two-slot LABEL VALUE recipe. If `label` is passed, renders
// as the prototype's `LABEL value` pattern (dim 9px uppercase name +
// bright 11px formatted value). Otherwise renders single-slot with
// just the formatted value (existing API).
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
  // Phase 6 — optional shift-modifier hook (called once on pointerdown
  // if shiftKey is held). Used by the time-of-day scrub to unlock the
  // sunrise/sunset clamp before the drag math kicks in.
  onShiftDrag,
  className = '',
  ...rest
}) {
  const startRef = useRef({ x: 0, v: 0, dragging: false, moved: false })
  const [dragging, setDragging] = useState(false)

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    if (onShiftDrag && e.shiftKey) {
      // Fire the shift-modifier hook so a caller can flip todUnlocked
      // (or similar) before drag math runs — the value commit below
      // uses the post-hook clamp range.
      onShiftDrag()
    }
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

  return (
    <Pill
      icon={icon}
      label={label != null ? label : undefined}
      value={label != null ? format(value) : undefined}
      className={`is-drag${dragging ? ' is-dragging' : ''}${className ? ' ' + className : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // suppress click — pointerup handles the click case
      onClick={(e) => e.preventDefault()}
      {...rest}
    >
      {label == null ? format(value) : null}
    </Pill>
  )
}
