import { useRef, useState, useEffect } from 'react'
import Pill from './Pill'

// Toggle pill that shows a hover popover (children) when `active` is true.
// 150ms close-delay lets the cursor cross from pill → popover without flicker.
// Anchored beneath the pill, right-aligned (works in the top-right cluster).
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

  const popoverVisible = open && (alwaysShowPopover || active)

  return (
    <div
      ref={wrapRef}
      className="mock-hover-pill-wrap"
      onPointerEnter={() => {
        cancelClose()
        if (alwaysShowPopover || active) setOpen(true)
      }}
      onPointerLeave={scheduleClose}
    >
      <Pill icon={icon} active={active} onClick={onToggle} {...rest}>
        {label}
      </Pill>
      {popoverVisible ? (
        <div
          className={`mock-popover mock-popover--hover mock-popover--${align} mock-popover--drop-${drop}`}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}
