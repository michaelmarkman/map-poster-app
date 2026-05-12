import { useRef, useState, useEffect } from 'react'
import Pill from './Pill'

// Click-to-open popover pill. Click outside closes. Esc closes.
//
// Phase 1 — Pill now supports the prototype's two-slot LABEL VALUE
// recipe. Pass `value` alongside `label` to render both slots; pass
// `value` alone (no label) for icon-only-pills like the search pill
// (icon + value, no label). Single-slot callers can keep passing
// `label` only and the existing single-slot rendering stands.
export default function PopoverPill({
  icon,
  label,
  value,
  children,
  align = 'left',
  drop = 'down',
  panelClassName = '',
  active = false,
  ...rest
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // Use the capture phase + pointerdown so the WebGL canvas (which captures
    // pointerdown for click-to-focus) doesn't swallow the close.
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="mock-popover-pill-wrap">
      <Pill
        icon={icon}
        label={value != null ? label : undefined}
        value={value}
        active={active || open}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        {...rest}
      >
        {/* Single-slot path (no value): pass label as children so Pill's
            unchanged single-slot rendering picks it up. */}
        {value == null ? label : null}
      </Pill>
      {open ? (
        <div
          className={`mock-popover mock-popover--click mock-popover--${align} mock-popover--drop-${drop}${panelClassName ? ' ' + panelClassName : ''}`}
        >
          {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
        </div>
      ) : null}
    </div>
  )
}
