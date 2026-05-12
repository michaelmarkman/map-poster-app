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
  const positionRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onFocusTap = (e) => {
      const { x, y, distance } = e.detail || {}
      if (typeof x !== 'number' || typeof y !== 'number') return
      positionRef.current = { x, y }
      // Real distance from Scene's raycast (Phase 15). Falls back to
      // ∞ if the ray missed geometry (user tapped sky).
      setLabel(formatDistance(distance))

      // Restart the animation by directly toggling the class on the
      // DOM node — bypasses React's state batching, which would
      // coalesce a setFocusing(false) → setFocusing(true) pair into a
      // single render where the class stays on the whole time and
      // the animation never re-triggers on rapid taps. The standard
      // remove → reflow → re-add dance forces the browser to restart
      // the keyframes from scratch.
      const node = reticleRef.current
      if (!node) return
      node.style.left = `${x}px`
      node.style.top = `${y}px`
      node.classList.remove('is-focusing')
      // Force a synchronous reflow so the class removal takes effect
      // before we add it back — without this the browser collapses
      // the toggle into a no-op.
      void node.offsetWidth
      node.classList.add('is-focusing')
    }
    window.addEventListener('focus-tap', onFocusTap)
    return () => window.removeEventListener('focus-tap', onFocusTap)
  }, [])

  const onAnimationEnd = (e) => {
    if (e.animationName !== 'reticleFocus') return
    // Strip the class so the reticle goes back to its hidden rest
    // state (opacity: 0). Next tap re-adds it via the reflow dance.
    reticleRef.current?.classList.remove('is-focusing')
  }

  return (
    <div
      ref={reticleRef}
      className="mock-reticle"
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
