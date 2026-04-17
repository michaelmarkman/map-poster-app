import { useEffect, useRef, useState } from 'react'
import { useAtom } from 'jotai'
import { modalsAtom } from '../atoms/modals'

// 3D Poster Preview modal. Ported from prototypes/poster-v3-ui.{html,jsx}.
// Uses refs for rotation state and direct DOM writes so the pointermove path
// stays allocation-free and matches the original math exactly (every frame
// writes `transform` + `boxShadow` on .pp-frame; re-rendering React for that
// would be overkill).
export default function PosterPreviewModal() {
  const [modals, setModals] = useAtom(modalsAtom)
  const open = modals.posterPreview

  const [imageSrc, setImageSrc] = useState('')
  const [label, setLabel] = useState('')

  const frameRef = useRef(null)
  const sceneRef = useRef(null)

  // Rotation state lives in refs — pointermove mutates these at ~60fps and we
  // don't want a React re-render per frame.
  const rotRef = useRef({ x: -5, y: 15 })
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0, velX: 0, velY: 0 })

  // Apply current rotation to the frame element. Shadow shifts with rotation
  // for a parallax feel — numbers match the prototype.
  const updateTransform = () => {
    const el = frameRef.current
    if (!el) return
    const { x, y } = rotRef.current
    el.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`
    const shadowX = -y * 1.5
    const shadowY = x * 1.5 + 30
    el.style.boxShadow =
      `${shadowX}px ${shadowY}px 60px rgba(0,0,0,0.5), ` +
      `${shadowX * 0.3}px ${shadowY * 0.3}px 20px rgba(0,0,0,0.3), ` +
      `inset 0 0 0 1px rgba(255,255,255,0.04)`
  }

  // Listen for the open-poster-preview custom event. Payload:
  //   { imageSrc, label, galleryIdx? }
  // galleryIdx is accepted for API parity but not used yet (live-update mode
  // from the canvas is out of scope for this port).
  useEffect(() => {
    const onOpen = (e) => {
      const detail = e?.detail || {}
      setImageSrc(detail.imageSrc || '')
      setLabel(detail.label || '')
      // Reset rotation to the prototype's default tilt.
      rotRef.current = { x: -5, y: 15 }
      setModals((m) => ({ ...m, posterPreview: true }))
    }
    window.addEventListener('open-poster-preview', onOpen)
    return () => window.removeEventListener('open-poster-preview', onOpen)
  }, [setModals])

  const close = () => setModals((m) => ({ ...m, posterPreview: false }))

  // Toggle the body class the CSS relies on (sidebars hide while preview is
  // open) and apply the initial transform once the frame is in the DOM.
  useEffect(() => {
    document.body.classList.toggle('preview-open', open)
    if (open) {
      // rAF so the frame has been laid out before we write its transform.
      requestAnimationFrame(updateTransform)
    }
    return () => {
      // On unmount, make sure we don't leave the body class stuck.
      if (open) document.body.classList.remove('preview-open')
    }
  }, [open])

  // Esc closes. Scoped to when the modal is open so we don't fight other
  // keydown handlers.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Drag-to-orbit. pointerdown on the scene, pointermove/pointerup on window
  // (so dragging off the scene still works). Math is a direct port of the
  // prototype.
  useEffect(() => {
    if (!open) return

    const onDown = (e) => {
      if (e.target.closest('.pp-close')) return
      dragRef.current.active = true
      dragRef.current.lastX = e.clientX
      dragRef.current.lastY = e.clientY
      dragRef.current.velX = 0
      dragRef.current.velY = 0
      e.preventDefault()
    }

    const onMove = (e) => {
      const d = dragRef.current
      if (!d.active) return
      const dx = e.clientX - d.lastX
      const dy = e.clientY - d.lastY
      const r = rotRef.current
      r.y += dx * 0.4
      r.x -= dy * 0.3
      r.x = Math.max(-30, Math.min(30, r.x))
      r.y = Math.max(-45, Math.min(45, r.y))
      d.velX = dx * 0.4
      d.velY = -dy * 0.3
      d.lastX = e.clientX
      d.lastY = e.clientY
      updateTransform()
    }

    const onUp = () => {
      const d = dragRef.current
      if (!d.active) return
      d.active = false
      // Momentum coast — decays velocity until it's negligible.
      const coast = () => {
        if (d.active) return
        if (Math.abs(d.velX) < 0.1 && Math.abs(d.velY) < 0.1) return
        const r = rotRef.current
        r.y += d.velX
        r.x += d.velY
        r.x = Math.max(-30, Math.min(30, r.x))
        r.y = Math.max(-45, Math.min(45, r.y))
        d.velX *= 0.92
        d.velY *= 0.92
        updateTransform()
        requestAnimationFrame(coast)
      }
      requestAnimationFrame(coast)
    }

    const scene = sceneRef.current
    scene?.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      scene?.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [open])

  return (
    <div id="poster-preview" className={open ? 'open' : ''}>
      <div className="pp-wall"></div>
      <button
        className="pp-close"
        id="pp-close"
        type="button"
        onClick={close}
        aria-label="Close preview"
      >
        ×
      </button>
      <div className="pp-scene" id="pp-scene" ref={sceneRef}>
        <div className="pp-frame" id="pp-frame" ref={frameRef}>
          <div className="pp-mat">
            <img className="pp-image" id="pp-image" src={imageSrc} alt={label} />
          </div>
          <div className="pp-label" id="pp-label">{label}</div>
        </div>
      </div>
      <div className="pp-hint">drag to orbit</div>
    </div>
  )
}
