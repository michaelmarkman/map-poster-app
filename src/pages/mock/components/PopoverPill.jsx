import { useRef, useState, useEffect } from 'react'
import Pill from './Pill'

// Click-to-open popover pill. Click outside closes. Esc closes.
export default function PopoverPill({
  icon,
  label,
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
        active={active || open}
        onClick={() => setOpen((v) => !v)}
        {...rest}
      >
        {label}
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
