import { useEffect, useRef, useState } from 'react'

// Phase 3 — MoMA tap-to-focus reticle.
//
// Listens for the `focus-tap` window event (dispatched by Scene's
// ClickToFocus handler whenever the user taps the canvas), positions
// the bracket at the click point, and plays the snap-in → hold →
// fade animation. Hidden at rest; pointer-events: none so it never
// intercepts clicks.
//
// Animation total: 560ms (set in mock.css as `reticleFocus`). Inside:
//   - 0ms..100ms   corners snap in from scale(1.5) → scale(1.0)
//   - 125ms..225ms micro-overshoot to scale(0.94) → settle at 1.0
//   - 225ms..335ms hold (center dot pulses once)
//   - 335ms..560ms fade out
//
// Distance readout (Phase 15): real meters from Scene's ClickToFocus,
// which raycasts from the tap point into the scene and emits the
// camera-to-hit distance on the `focus-tap` event detail. If the ray
// missed geometry (user tapped sky) the value is null and the
// reticle falls back to a generic `FOCUS · ∞` label.
//
// `formatDistance` renders the same way a real rangefinder reads:
//   <1km           → "412 m"
//   1km – 9.9km    → "1.4 km"
//   ≥10km          → "12 km"
function formatDistance(d) {
  if (d == null || !Number.isFinite(d) || d <= 0) return '∞'
  if (d < 1000) return `${Math.round(d)} m`
  if (d < 10_000) return `${(d / 1000).toFixed(1)} km`
  return `${Math.round(d / 1000)} km`
}

export default function FocusReticle() {
  const reticleRef = useRef(null)
  const [label, setLabel] = useState('312 m')
  // The `focusing` flag is what toggles the .is-focusing class; we
  // remove it on animationend so the next event can re-trigger the
  // animation cleanly via the standard remove → reflow → add dance.
  const [focusing, setFocusing] = useState(false)
  const positionRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onFocusTap = (e) => {
      const { x, y, distance } = e.detail || {}
      if (typeof x !== 'number' || typeof y !== 'number') return
      positionRef.current = { x, y }
      // Real distance from Scene's raycast. Pre-Phase-15 builds (and
      // tests that don't construct the full Scene) didn't include
      // `distance` on the event detail — fall back gracefully.
      setLabel(formatDistance(distance))
      // Force the class off → reflow → on so the animation restarts
      // even on rapid taps. React state via two setters and a 0ms
      // timeout works cleanly enough; the rAF dance from the
      // vanilla prototype isn't needed because the class is bound
      // via React state, not direct DOM manipulation.
      setFocusing(false)
      requestAnimationFrame(() => {
        const node = reticleRef.current
        if (node) {
          node.style.left = `${positionRef.current.x}px`
          node.style.top = `${positionRef.current.y}px`
        }
        setFocusing(true)
      })
    }
    window.addEventListener('focus-tap', onFocusTap)
    return () => window.removeEventListener('focus-tap', onFocusTap)
  }, [])

  const onAnimationEnd = (e) => {
    if (e.animationName === 'reticleFocus') setFocusing(false)
  }

  return (
    <div
      ref={reticleRef}
      className={`mock-reticle${focusing ? ' is-focusing' : ''}`}
      onAnimationEnd={onAnimationEnd}
      aria-hidden="true"
    >
      <div className="mock-reticle-bracket">
        <span />
        <span className="mock-reticle-center" />
        <span />
      </div>
      <div className="mock-reticle-label">
        Focus<span className="mock-reticle-sep">·</span>
        {label}
      </div>
    </div>
  )
}
