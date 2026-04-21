import { useRef, useState, useEffect } from 'react'
import Pill from './Pill'

// Detect coarse pointers (touch). We read once at mount and subscribe to
// changes — a hybrid tablet with a pencil plugged in mid-session can flip
// between fine and coarse.
function useCoarsePointer() {
  const [coarse, setCoarse] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(pointer: coarse)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(pointer: coarse)')
    const onChange = (e) => setCoarse(e.matches)
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else mq.addListener(onChange)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange)
      else mq.removeListener(onChange)
    }
  }, [])
  return coarse
}

// Toggle pill with a popover. Desktop: hover on the pill opens the popover;
// 150ms close-delay lets the cursor cross from pill → popover without
// flicker. Touch: tap toggles (the pill's onToggle fires AND the popover
// opens); tap outside or Esc closes. Anchored beneath the pill, right-
// aligned by default (works in the top-right cluster).
export default function HoverPopoverPill({
  icon,
  label,
  active,
  onToggle,
  children,
  align = 'right',
  drop = 'down',
  // When true, hover always opens the popover regardless of `active`.
  // Default behavior gates the popover on `active` so toggle-off hides it.
  alwaysShowPopover = false,
  ...rest
}) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef(null)
  const wrapRef = useRef(null)
  const coarse = useCoarsePointer()

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), 150)
  }
  useEffect(() => () => cancelClose(), [])
  useEffect(() => {
    if (!active && !alwaysShowPopover) setOpen(false)
  }, [active, alwaysShowPopover])

  // Touch only: close on outside-tap or Esc. Uses capture-phase pointerdown
  // so the WebGL canvas doesn't swallow the close.
  useEffect(() => {
    if (!coarse || !open) return
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [coarse, open])

  const popoverVisible = open && (alwaysShowPopover || active)

  const handlePillClick = () => {
    onToggle?.()
    if (coarse) setOpen((v) => !v)
  }

  // Desktop hover listeners are no-ops on touch (fires OS-synth mouse
  // events on some devices that would reopen after a close).
  const wrapHover = coarse
    ? {}
    : {
        onPointerEnter: () => {
          cancelClose()
          if (alwaysShowPopover || active) setOpen(true)
        },
        onPointerLeave: scheduleClose,
      }
  const panelHover = coarse
    ? {}
    : { onPointerEnter: cancelClose, onPointerLeave: scheduleClose }

  return (
    <div
      ref={wrapRef}
      className="mock-hover-pill-wrap"
      {...wrapHover}
    >
      <Pill icon={icon} active={active} onClick={handlePillClick} {...rest}>
        {label}
      </Pill>
      {popoverVisible ? (
        <div
          className={`mock-popover mock-popover--hover mock-popover--${align} mock-popover--drop-${drop}`}
          {...panelHover}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}
