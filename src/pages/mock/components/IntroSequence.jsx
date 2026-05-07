import { useEffect, useRef, useState } from 'react'
import { useSetAtom } from 'jotai'
import { introDoneAtom } from '../../editor/atoms/sidebar'

// First-boot intro sequence. Plays on every page load (per the
// Phase 2.7 follow-up Figma frames in ZRmt5GyQEEIyigxYiALwTJ):
//
//   1. WORDMARK    — dark backdrop, "vedute" appears centered.
//   2. TYPING      — dictionary entry types in beside it ("are highly
//                    detailed, atmospheric paintings or prints that
//                    capture the breathtaking beauty of cityscapes
//                    and picturesque vistas.").
//   3. HOLD        — full sentence holds for a beat.
//   4. CONSOLIDATE — definition fades, wordmark stays.
//   5. REVEAL      — overlay lightens; corner clusters fade in one-by-
//                    one (top-left → top-right → bottom-left →
//                    bottom-mid → bottom-right) at opacity-0 → 1.
//   6. SETTLE      — wordmark animates from center to its top-center
//                    home; the dark overlay fades to fully transparent.
//   7. DONE        — sets introDoneAtom; OnboardingCard becomes
//                    eligible to render.
//
// Esc skips straight to DONE. Click is NOT a skip (per design — too
// easy to bump on touch / accidental drags).
//
// CSS lives in mock.css (.intro-* classes); body[data-intro-phase]
// drives the cluster opacity transitions so the corner clusters
// themselves don't have to know about the intro.

// Phase timeline — total ~9.5s without skip.
const TIMING = {
  // Time the wordmark stays alone before the typewriter starts.
  wordmarkHold: 600,
  // Per-character interval for the definition typewriter. ~165 chars
  // total → ~3.5s typing duration at 22ms/char.
  typeChar: 22,
  // Hold the full sentence on screen before consolidating.
  fullSentenceHold: 1100,
  // Definition fade-out duration (consolidate phase).
  consolidate: 600,
  // Per-corner reveal stagger. 5 corners × this gives total reveal time.
  revealStagger: 280,
  // Settle phase (wordmark moves to top + overlay fades).
  settle: 800,
}

const DEFINITION = 'are highly detailed, atmospheric paintings or prints that capture the breathtaking beauty of cityscapes and picturesque vistas.'

// Corner reveal order. Matches the natural reading sweep — top-left,
// top-right, bottom-left, bottom-mid, bottom-right.
const REVEAL_ORDER = [
  'mock-cluster--top-left',
  'mock-cluster--top-right',
  'mock-cluster--bottom-left',
  'mock-cluster--bottom-mid',
  'mock-cluster--bottom-right',
]

export default function IntroSequence() {
  const setIntroDone = useSetAtom(introDoneAtom)

  // 'wordmark' | 'typing' | 'hold' | 'consolidate' | 'reveal' | 'settle' | 'done'
  const [phase, setPhase] = useState('wordmark')
  // How many definition characters to render — drives the typewriter.
  const [typedChars, setTypedChars] = useState(0)
  // How many corners have been revealed — drives the stagger.
  const [revealedCount, setRevealedCount] = useState(0)

  // Latched skip flag: once Esc fires we ignore in-flight timers.
  const skippedRef = useRef(false)

  // Drive phase transitions via setTimeout chains. Each phase's effect
  // schedules the next; a clear-on-unmount pattern keeps strict-mode
  // double-invocations safe.
  useEffect(() => {
    if (skippedRef.current) return undefined
    let timer
    if (phase === 'wordmark') {
      timer = setTimeout(() => setPhase('typing'), TIMING.wordmarkHold)
    } else if (phase === 'typing') {
      // Self-recursing typewriter — append one char per tick until the
      // definition is fully visible, then transition.
      if (typedChars >= DEFINITION.length) {
        timer = setTimeout(() => setPhase('hold'), TIMING.fullSentenceHold)
      } else {
        timer = setTimeout(() => setTypedChars((n) => n + 1), TIMING.typeChar)
      }
    } else if (phase === 'hold') {
      timer = setTimeout(() => setPhase('consolidate'), TIMING.consolidate)
    } else if (phase === 'consolidate') {
      timer = setTimeout(() => setPhase('reveal'), TIMING.consolidate)
    } else if (phase === 'reveal') {
      if (revealedCount >= REVEAL_ORDER.length) {
        timer = setTimeout(() => setPhase('settle'), TIMING.revealStagger)
      } else {
        timer = setTimeout(() => setRevealedCount((n) => n + 1), TIMING.revealStagger)
      }
    } else if (phase === 'settle') {
      timer = setTimeout(() => setPhase('done'), TIMING.settle)
    }
    return () => clearTimeout(timer)
  }, [phase, typedChars, revealedCount])

  // Esc → skip. Snap state to "done" so the overlay disappears.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      skippedRef.current = true
      setPhase('done')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Sync body[data-intro-phase] so cluster CSS can react. Cleared
  // (attribute removed) when we hit 'done'.
  useEffect(() => {
    if (phase === 'done') {
      document.body.removeAttribute('data-intro-phase')
      // Use a separate counter for the reveal-stagger CSS so a
      // cluster that's already mid-fade keeps its visible state when
      // the intro ends mid-flight.
      document.body.removeAttribute('data-intro-revealed')
      setIntroDone(true)
      return undefined
    }
    document.body.setAttribute('data-intro-phase', phase)
    document.body.setAttribute('data-intro-revealed', String(revealedCount))
    return undefined
  }, [phase, revealedCount, setIntroDone])

  if (phase === 'done') return null

  const isSettling = phase === 'settle'
  const definitionVisible = phase === 'typing' || phase === 'hold'
  const visibleDef = DEFINITION.slice(0, typedChars)

  return (
    <div
      className={`intro-overlay${isSettling ? ' is-settling' : ''}`}
      role="presentation"
      aria-hidden="true"
    >
      <div className={`intro-wordmark intro-wordmark--phase-${phase}`}>
        <span className="intro-wordmark-mark">vedute</span>
        {definitionVisible && (
          <span className="intro-wordmark-def">
            {' '}
            {visibleDef}
            <span className="intro-caret" aria-hidden="true">▍</span>
          </span>
        )}
      </div>
    </div>
  )
}
