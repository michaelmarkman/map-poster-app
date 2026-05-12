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
// Distance readout randomises on each tap (180–660m) — rangefinder
// feel from the prototype. React port deliberately keeps the value
// random; if/when DoF's actual focal-distance is read by Scene, that
// number can be threaded through the event detail.
export default function FocusReticle() {
  const reticleRef = useRef(null)
  const [meters, setMeters] = useState(312)
  // The `focusing` flag is what toggles the .is-focusing class; we
  // remove it on animationend so the next event can re-trigger the
  // animation cleanly via the standard remove → reflow → add dance.
  const [focusing, setFocusing] = useState(false)
  const positionRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onFocusTap = (e) => {
      const { x, y } = e.detail || {}
      if (typeof x !== 'number' || typeof y !== 'number') return
      positionRef.current = { x, y }
      // Randomize the distance for the rangefinder feel.
      setMeters(Math.round(180 + Math.random() * 480))
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
        {meters} m
      </div>
    </div>
  )
}
