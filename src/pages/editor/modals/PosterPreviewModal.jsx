import { useEffect, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { modalsAtom } from '../atoms/modals'
import { aspectRatioAtom, fillModeAtom } from '../atoms/ui'
import { snapshotCanvas } from '../utils/export'

// 3D Poster Preview modal. Ported from prototypes/poster-v3-ui.{html,jsx}.
// Uses refs for rotation state and direct DOM writes so the pointermove path
// stays allocation-free and matches the original math exactly (every frame
// writes `transform` + `boxShadow` on .pp-frame; re-rendering React for that
// would be overkill).
export default function PosterPreviewModal() {
  const [modals, setModals] = useAtom(modalsAtom)
  const open = modals.posterPreview

  // Frame dimensions follow the user's current aspect ratio. `fillMode`
  // falls back to 4:3 since "fill" has no natural aspect of its own.
  const aspect = useAtomValue(aspectRatioAtom)
  const fillMode = useAtomValue(fillModeAtom)
  const effectiveAspect = fillMode ? 1.333 : aspect
  // Keep the frame a comfortable size — the larger of 440px wide
  // (landscape) or 480px tall (portrait) anchors it.
  const frameW = effectiveAspect >= 1 ? 560 : Math.round(480 * effectiveAspect)
  const frameH = effectiveAspect >= 1 ? Math.round(560 / effectiveAspect) : 480

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

  // Listen for the open-poster-preview custom event. Payload is optional —
  // when nothing is passed, we snapshot the live canvas on open. Explicit
  // imageSrc still wins (that's how the Lightbox previews a gallery entry).
  useEffect(() => {
    const onOpen = (e) => {
      const detail = e?.detail || {}
      if (detail.imageSrc) setImageSrc(detail.imageSrc)
      else setImageSrc(snapshotCanvas(2) || '')
      setLabel(detail.label || '')
      rotRef.current = { x: -5, y: 15 }
      setModals((m) => ({ ...m, posterPreview: true }))
    }
    window.addEventListener('open-poster-preview', onOpen)
    return () => window.removeEventListener('open-poster-preview', onOpen)
  }, [setModals])

  // When the atom flips to true without a preceding open-poster-preview
  // event (e.g. the floating toggle button just set the atom), grab a
  // fresh canvas snapshot so the frame has something to show. Reset the
  // default tilt too.
  useEffect(() => {
    if (!open) return
    if (!imageSrc) {
      const snap = snapshotCanvas(2) || ''
      if (snap) setImageSrc(snap)
    }
    rotRef.current = { x: -5, y: 15 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Clear the stored snapshot when the modal closes so the next open grabs
  // a fresh view rather than showing a stale one.
  useEffect(() => {
    if (!open) setImageSrc('')
  }, [open])

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
      <div
        className="pp-scene"
        id="pp-scene"
        ref={sceneRef}
        style={{ width: frameW, height: frameH }}
      >
        <div className="pp-frame" id="pp-frame" ref={frameRef}>
          <div className="pp-mat">
            {imageSrc && <img className="pp-image" id="pp-image" src={imageSrc} alt={label} />}
          </div>
          <div className="pp-label" id="pp-label">{label}</div>
        </div>
      </div>
      <div className="pp-hint">drag to orbit</div>
    </div>
  )
}
