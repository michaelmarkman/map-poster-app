import { useEffect, useRef, useState } from 'react'
import { useSetAtom } from 'jotai'
import { introDoneAtom } from '../../editor/atoms/sidebar'

// First-boot intro sequence. Plays on first visit (per the Phase 2.7
// follow-up Figma frames in ZRmt5GyQEEIyigxYiALwTJ); persisted via
// localStorage so returning users skip it:
//
//   1. WORDMARK    — dark backdrop, "vedute" handwrites itself in
//                    italianno cursive (tegaki library — strokes are
//                    drawn one-by-one as if by hand).
//   2. TYPING      — dictionary entry fades in beside it ("are highly
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

// Phase timing.
//
// User-driven advancement: clicking the overlay moves the intro from
// one read-text phase to the next (typing → consolidate → reveal).
// The wordmark phase auto-advances to typing once tegaki's onComplete
// fires (handwriting finished); during reveal the corner clusters
// stagger in automatically; settle runs on a fixed timer. This keeps
// the user in control of the parts they're reading without making
// them click their way through every micro-step.
const TIMING = {
  // Hard cap on tegaki playback. If onComplete never fires (font load
  // failure, render error), fall through after this many ms so the
  // intro doesn't stall on the wordmark.
  wordmarkFallback: 6000,
  // Definition fade-in / fade-out window. CSS transitions on the
  // .intro-wordmark-def opacity drive the visual; the JS phase clock
  // doesn't tick during typing/hold/consolidate any more — clicks do.
  defFadeIn: 500,
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

  // 'wordmark' | 'typing' | 'consolidate' | 'reveal' | 'settle' | 'done'
  // (legacy 'hold' phase folded into 'typing' since the user advances
  // them with a click anyway; 'typing' itself is a misnomer since the
  // definition now just fades in, but the CSS hooks key off
  // body[data-intro-phase="typing"] so the name stays.)
  // Lazy initializer reads the localStorage seen-flag once on mount —
  // returning users start at 'done' so the intro doesn't replay.
  const [phase, setPhase] = useState(() => (hasSeenIntro() ? 'done' : 'wordmark'))
  // How many corners have been revealed — drives the stagger.
  const [revealedCount, setRevealedCount] = useState(0)
  // Tegaki onComplete signal — true once the handwriting finishes.
  // Used to gate the wordmark→typing click handler (no advancing
  // before the user has seen the wordmark fully drawn).
  const [wordmarkDrawn, setWordmarkDrawn] = useState(false)
  // Lazy-load tegaki + the italianno bundle (~230KB combined, gzipped
  // ~65KB). Only first-visit users need it; returning users start at
  // phase='done' so they never trigger the imports. Skipped entirely
  // when intro-seen=1 to avoid wasted network on returning visits.
  const [Tegaki, setTegaki] = useState(null)
  const [italianno, setItalianno] = useState(null)
  useEffect(() => {
    if (hasSeenIntro()) return
    let cancelled = false
    Promise.all([
      import('tegaki/react'),
      import('tegaki/fonts/italianno'),
    ]).then(([reactMod, fontMod]) => {
      if (cancelled) return
      // Wrap setTegaki in a callback to avoid React calling the
      // component as a function (it sees a function ref otherwise).
      setTegaki(() => reactMod.TegakiRenderer)
      setItalianno(fontMod.default)
    }).catch(() => {
      // If the import fails (offline / bundle missing), the wordmark
      // stays empty and the fallback timer (TIMING.wordmarkFallback)
      // pushes the phase machine forward so the intro doesn't stall.
    })
    return () => { cancelled = true }
  }, [])

  // Latched skip flag: once Esc fires we ignore in-flight timers.
  const skippedRef = useRef(false)

  // Phase progression. Most phases now wait for a user click (see
  // advancePhase below). The exceptions:
  //   - wordmark: auto-advances to typing as soon as tegaki's
  //     onComplete fires. A 6s fallback timer covers the case where
  //     the lazy import / font load fails so the intro doesn't stall.
  //   - reveal: corners stagger in automatically.
  //   - settle: fixed timer; not user-controllable since it's the
  //     "out" animation.
  useEffect(() => {
    if (skippedRef.current) return undefined
    let timer
    if (phase === 'wordmark') {
      if (wordmarkDrawn) {
        // Tegaki finished — but DON'T auto-advance. The user advances
        // by clicking. (This used to auto-tick to 'typing' here; the
        // intro change brought clicking to the front.)
        return undefined
      }
      // Fallback: in case tegaki never resolves, push forward.
      timer = setTimeout(() => setWordmarkDrawn(true), TIMING.wordmarkFallback)
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
  }, [phase, revealedCount, wordmarkDrawn])

  // Click handler: advances the intro one phase. Used while the user
  // is reading the wordmark / definition; once we hit reveal, the
  // staggered corner-fade and settle play out automatically.
  const advancePhase = () => {
    if (skippedRef.current) return
    if (phase === 'wordmark') {
      // Only advance once tegaki has finished drawing — clicking
      // mid-stroke would cut off the brand moment. (Esc still skips.)
      if (wordmarkDrawn) setPhase('typing')
      return
    }
    if (phase === 'typing') return setPhase('consolidate')
    if (phase === 'consolidate') return setPhase('reveal')
    // reveal / settle / done: ignore clicks (auto-driven from here).
  }

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
  const definitionVisible = phase === 'typing'

  return (
    <div
      className={`intro-overlay${isSettling ? ' is-settling' : ''}`}
      role="presentation"
      aria-hidden="true"
      onClick={advancePhase}
    >
      <div className={`intro-wordmark intro-wordmark--phase-${phase}`}>
        <span className="intro-wordmark-mark">
          {/* Tegaki handwrites "vedute" stroke-by-stroke in italianno
           * cursive. mode='uncontrolled' so the strokes actually
           * render visibly (CSS mode tested in 456f4e8 ended up
           * not painting the strokes for some users — different
           * compositor pathway than the JS-clock-driven uncontrolled
           * mode). The handwriting is a one-shot ~2-3s animation;
           * after that tegaki is idle, so the per-frame cost only
           * spans those few seconds at the start. */}
          {Tegaki && italianno ? (
            <Tegaki
              font={italianno}
              time={{ mode: 'uncontrolled', speed: 1, loop: false }}
              onComplete={() => setWordmarkDrawn(true)}
              style={{ fontSize: 88, color: '#fff' }}
            >
              vedute
            </Tegaki>
          ) : null}
        </span>
        {definitionVisible && (
          <span className="intro-wordmark-def"> {DEFINITION}</span>
        )}
      </div>

      {/* Click hint — appears once a click would actually advance
       *  something (i.e. wordmark finished, or in typing/consolidate).
       *  Hidden during reveal/settle so the auto-driven phases don't
       *  imply they're click-driven. */}
      {((phase === 'wordmark' && wordmarkDrawn) ||
        phase === 'typing' ||
        phase === 'consolidate') && (
        <div className="intro-click-hint" aria-hidden="true">
          Click to continue
        </div>
      )}
    </div>
  )
}
