import { useRef, useState } from 'react'
import Pill from './Pill'

// Drag-on-pill scrubber. pointerdown captures pointer; pointermove maps Δx
// to a value change via `scale` (units per pixel). 3px threshold separates
// click vs drag — caller can pass onClick for the click case.
export default function DragPill({
  icon,
  value,
  setValue,
  min,
  max,
  scale,
  format,
  onClick,
  className = '',
  ...rest
}) {
  const startRef = useRef({ x: 0, v: 0, dragging: false, moved: false })
  const [dragging, setDragging] = useState(false)

  const onPointerDown = (e) => {
    if (e.button !== 0) return
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
      className={`is-drag${dragging ? ' is-dragging' : ''}${className ? ' ' + className : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // suppress click — pointerup handles the click case
      onClick={(e) => e.preventDefault()}
      {...rest}
    >
      {format(value)}
    </Pill>
  )
}
