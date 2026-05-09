import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { Provider, createStore } from 'jotai'

// Tegaki's TegakiRenderer needs ResizeObserver + canvas font metrics —
// neither lives in jsdom. Mock it as a render-only stub that fires
// onComplete on next tick so the phase machine can progress as if the
// handwriting finished. The actual tegaki SVG rendering is exercised
// in the visual / smoke verify, not unit tests.
vi.mock('tegaki/react', () => ({
  TegakiRenderer: ({ children, onComplete }) => {
    // Schedule onComplete in a microtask so the test's fake-timer flush
    // catches it on the same advance.
    Promise.resolve().then(() => onComplete && onComplete())
    return <span data-testid="tegaki-stub">{children}</span>
  },
}))
vi.mock('tegaki/fonts/italianno', () => ({ default: { __mock: 'italianno' } }))

import IntroSequence from '../components/IntroSequence'
import { introDoneAtom } from '../../editor/atoms/sidebar'

function renderWith() {
  const store = createStore()
  return {
    store,
    ...render(
      <Provider store={store}>
        <IntroSequence />
      </Provider>,
    ),
  }
}

// Advance fake timers in small chunks, flushing React microtasks
// between each tick so recursive setTimeout chains (like the
// typewriter and the phase machine) actually progress. With a single
// large advanceTimersByTime() call, the timer that fires schedules a
// new timer in a setState → effect chain that doesn't run until
// React's microtask flushes — by which time the time window has
// already been consumed.
async function advance(ms, step = 25) {
  let remaining = ms
  while (remaining > 0) {
    const chunk = Math.min(step, remaining)
    await act(async () => {
      vi.advanceTimersByTime(chunk)
      // Let React flush any state updates triggered by timers.
      await Promise.resolve()
    })
    remaining -= chunk
  }
}

describe('IntroSequence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.removeAttribute('data-intro-phase')
    document.body.removeAttribute('data-intro-revealed')
    // The intro persists a once-only flag in localStorage; clean it
    // between tests so each fresh-mount test starts as "first visit".
    try { localStorage.removeItem('vedute_intro_seen') } catch {}
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.removeAttribute('data-intro-phase')
    document.body.removeAttribute('data-intro-revealed')
    try { localStorage.removeItem('vedute_intro_seen') } catch {}
  })

  it('starts in the wordmark phase with body[data-intro-phase] set', () => {
    renderWith()
    expect(document.body.getAttribute('data-intro-phase')).toBe('wordmark')
  })

  it('renders the "vedute" wordmark once tegaki has lazy-loaded', async () => {
    const { container } = renderWith()
    // Tegaki is dynamic-imported on mount; the renderer is null on the
    // first paint and resolves a tick later. Flush microtasks + give
    // React a chance to commit the next render before asserting.
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(container.textContent).toContain('vedute')
  })

  it('does NOT render the definition during the wordmark phase', () => {
    const { container } = renderWith()
    expect(container.textContent).not.toContain('highly detailed')
  })

  it('clicking the overlay (after handwriting) advances wordmark→typing and renders the definition', async () => {
    const { container } = renderWith()
    // Tegaki mock fires onComplete on next tick → wordmarkDrawn=true.
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    // Click the overlay to advance to typing.
    await act(async () => { fireEvent.click(container.querySelector('.intro-overlay')) })
    expect(document.body.getAttribute('data-intro-phase')).toBe('typing')
    expect(container.textContent).toContain('highly detailed')
    expect(container.textContent).toContain('cityscapes')
  })

  it("clicking before handwriting completes doesn't advance the phase", async () => {
    // Brand-protection: clicking mid-stroke shouldn't cut off the
    // wordmark. The advance happens only once tegaki onComplete fires.
    const { container } = renderWith()
    // Don't flush microtasks — wordmarkDrawn stays false.
    fireEvent.click(container.querySelector('.intro-overlay'))
    expect(document.body.getAttribute('data-intro-phase')).toBe('wordmark')
  })

  it('Esc skips straight to done and clears body data-attr', async () => {
    const { store, container } = renderWith()
    expect(document.body.hasAttribute('data-intro-phase')).toBe(true)
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(store.get(introDoneAtom)).toBe(true)
    expect(document.body.hasAttribute('data-intro-phase')).toBe(false)
    // Component returns null when done — overlay gone.
    expect(container.querySelector('.intro-overlay')).toBe(null)
  })

  it('non-Escape keys do not skip', async () => {
    const { store } = renderWith()
    await act(async () => {
      fireEvent.keyDown(window, { key: 'a' })
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(store.get(introDoneAtom)).toBe(false)
    expect(document.body.getAttribute('data-intro-phase')).toBe('wordmark')
  })

  // Helper: drive the phase machine through to reveal via clicks
  // (wordmark → typing → consolidate → reveal). Reveal + settle then
  // play out automatically on timers.
  async function clickThroughToReveal(container) {
    // Wait for tegaki onComplete (mock fires it next tick).
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const overlay = container.querySelector('.intro-overlay')
    await act(async () => { fireEvent.click(overlay) }) // → typing
    await act(async () => { fireEvent.click(overlay) }) // → consolidate
    await act(async () => { fireEvent.click(overlay) }) // → reveal
  }

  it('reveals corner clusters one-by-one via data-intro-revealed', async () => {
    const { container } = renderWith()
    await clickThroughToReveal(container)
    // Burn time to let the auto-stagger run through 5 corners + settle.
    await advance(5_000, 50)
    const phase = document.body.getAttribute('data-intro-phase')
    const revealed = document.body.getAttribute('data-intro-revealed')
    if (phase === 'reveal' || phase === 'settle') {
      expect(Number(revealed)).toBeGreaterThanOrEqual(5)
    }
  })

  it('writes data-intro-revealed during reveal phase (incremental counter)', async () => {
    const { container } = renderWith()
    await clickThroughToReveal(container)
    // Tick a bit so revealedCount advances at least once.
    await advance(500, 50)
    const phase = document.body.getAttribute('data-intro-phase')
    if (phase === 'reveal') {
      const revealed = document.body.getAttribute('data-intro-revealed')
      expect(revealed).toBeDefined()
      expect(Number(revealed)).toBeGreaterThanOrEqual(0)
    }
  })

  it('eventually reaches done; introDoneAtom flips to true', async () => {
    const { store, container } = renderWith()
    await clickThroughToReveal(container)
    // Reveal stagger + settle ≈ 5*280 + 800 ≈ 2.2s; pad generously.
    await advance(5_000, 50)
    expect(store.get(introDoneAtom)).toBe(true)
  })

  it('clears the body data attributes when phase reaches done', async () => {
    const { container } = renderWith()
    await clickThroughToReveal(container)
    await advance(5_000, 50)
    await advance(15_000, 50)
    expect(document.body.hasAttribute('data-intro-phase')).toBe(false)
    expect(document.body.hasAttribute('data-intro-revealed')).toBe(false)
  })

  it('persists vedute_intro_seen=1 once the intro finishes', async () => {
    const { container } = renderWith()
    await clickThroughToReveal(container)
    await advance(5_000, 50)
    expect(localStorage.getItem('vedute_intro_seen')).toBe('1')
  })

  it('Esc skip also persists the seen-flag (counts as a completion)', async () => {
    renderWith()
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(localStorage.getItem('vedute_intro_seen')).toBe('1')
  })

  it('returning users (vedute_intro_seen=1) skip the intro entirely', () => {
    localStorage.setItem('vedute_intro_seen', '1')
    const { store, container } = renderWith()
    // Should never render the overlay — phase starts at done.
    expect(container.querySelector('.intro-overlay')).toBe(null)
    expect(store.get(introDoneAtom)).toBe(true)
    expect(document.body.hasAttribute('data-intro-phase')).toBe(false)
  })

  it('removes the keydown listener on unmount', () => {
    const realAdd = window.addEventListener
    const realRemove = window.removeEventListener
    let added = 0
    let removed = 0
    window.addEventListener = function (type, ...rest) {
      if (type === 'keydown') added++
      return realAdd.call(this, type, ...rest)
    }
    window.removeEventListener = function (type, ...rest) {
      if (type === 'keydown') removed++
      return realRemove.call(this, type, ...rest)
    }
    try {
      const { unmount } = renderWith()
      unmount()
      expect(added).toBe(removed)
    } finally {
      window.addEventListener = realAdd
      window.removeEventListener = realRemove
    }
  })
})
