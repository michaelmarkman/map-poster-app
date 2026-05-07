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

// Phase timeline — total ~6s without skip.
const TIMING = {
  // Time the wordmark stays alone before the definition fades in.
  wordmarkHold: 600,
  // Definition fade-in window. CSS transitions the .intro-wordmark-def
  // span's opacity 0 → 1 over this duration; this constant keeps the JS
  // phase clock aligned.
  defFadeIn: 500,
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

// localStorage flag — set when the intro plays through to completion
// (or the user hits Esc). On every subsequent mount we read this and
// skip the intro entirely. Persisted forever; users only see the
// intro the first time they open Vedute on a given browser.
const INTRO_SEEN_KEY = 'vedute_intro_seen'

function hasSeenIntro() {
  try {
    return typeof localStorage !== 'undefined' &&
      localStorage.getItem(INTRO_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1')
  } catch {}
}

export default function IntroSequence() {
  const setIntroDone = useSetAtom(introDoneAtom)

  // 'wordmark' | 'typing' | 'hold' | 'consolidate' | 'reveal' | 'settle' | 'done'
  // ('typing' is a legacy name from when the definition typed in
  // char-by-char; it now fades in as a whole. Kept for the CSS hooks
  // already keyed on `body[data-intro-phase="typing"]`.)
  // Lazy initializer reads the localStorage seen-flag once on mount —
  // returning users start at 'done' so the intro doesn't replay.
  const [phase, setPhase] = useState(() => (hasSeenIntro() ? 'done' : 'wordmark'))
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
      // Definition fades in (CSS-driven on .intro-wordmark-def). Once
      // the fade-in window has elapsed, transition to the hold phase
      // so the full sentence sits on screen.
      timer = setTimeout(() => setPhase('hold'), TIMING.defFadeIn)
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
  }, [phase, revealedCount])

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
      // Persist the seen-flag so subsequent mounts skip the intro.
      markIntroSeen()
      setIntroDone(true)
      return undefined
    }
    document.body.setAttribute('data-intro-phase', phase)
    document.body.setAttribute('data-intro-revealed', String(revealedCount))
    return undefined
  }, [phase, revealedCount, setIntroDone])

  if (phase === 'done') return null

  const isSettling = phase === 'settle'
  // Definition is in the DOM during typing + hold; CSS keys off
  // body[data-intro-phase] to fade .intro-wordmark-def in/out.
  const definitionVisible = phase === 'typing' || phase === 'hold'

  return (
    <div
      className={`intro-overlay${isSettling ? ' is-settling' : ''}`}
      role="presentation"
      aria-hidden="true"
    >
      <div className={`intro-wordmark intro-wordmark--phase-${phase}`}>
        <span className="intro-wordmark-mark">vedute</span>
        {definitionVisible && (
          <span className="intro-wordmark-def"> {DEFINITION}</span>
        )}
      </div>
    </div>
  )
}
