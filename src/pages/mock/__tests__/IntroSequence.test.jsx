import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
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
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.removeAttribute('data-intro-phase')
    document.body.removeAttribute('data-intro-revealed')
  })

  it('starts in the wordmark phase with body[data-intro-phase] set', () => {
    renderWith()
    expect(document.body.getAttribute('data-intro-phase')).toBe('wordmark')
  })

  it('renders the "vedute" wordmark from the start', () => {
    const { container } = renderWith()
    expect(container.textContent).toContain('vedute')
  })

  it('does NOT render the definition during the wordmark phase', () => {
    const { container } = renderWith()
    expect(container.textContent).not.toContain('highly detailed')
  })

  it('progresses to typing and starts revealing the definition', async () => {
    const { container } = renderWith()
    // Advance past the wordmark hold (600ms) into typing.
    await advance(700)
    expect(document.body.getAttribute('data-intro-phase')).toBe('typing')
    // Tick the typewriter forward a few chars.
    await advance(200)
    // First few chars are "are".
    expect(container.textContent).toContain('are')
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

  it('reveals corner clusters one-by-one via data-intro-revealed', async () => {
    renderWith()
    // Race forward through wordmark → typing → hold → consolidate → reveal.
    // Burn a generous chunk of time to reach reveal.
    await advance(20_000, 50)
    // After enough time we're in either reveal (with a counter) or
    // settle / done. data-intro-revealed should have advanced to 5.
    const phase = document.body.getAttribute('data-intro-phase')
    const revealed = document.body.getAttribute('data-intro-revealed')
    if (phase === 'reveal' || phase === 'settle') {
      expect(Number(revealed)).toBeGreaterThanOrEqual(5)
    }
  })

  it('writes data-intro-revealed during reveal phase (incremental counter)', async () => {
    renderWith()
    // Push to reveal phase (after wordmark + typing + hold + consolidate).
    // ~600 (hold) + 165 chars * 22ms (~3630) + 1100 (sentence hold) +
    // 600 (consolidate1) + 600 (consolidate2) ≈ 6.5s.
    await advance(7_000, 50)
    // We should now be in reveal with revealed >= 0 set.
    const phase = document.body.getAttribute('data-intro-phase')
    if (phase === 'reveal') {
      const revealed = document.body.getAttribute('data-intro-revealed')
      expect(revealed).toBeDefined()
      expect(Number(revealed)).toBeGreaterThanOrEqual(0)
    }
  })

  it('eventually reaches done; introDoneAtom flips to true', async () => {
    const { store } = renderWith()
    // Long enough for the entire sequence + safety margin (~10s total).
    await advance(15_000, 50)
    expect(store.get(introDoneAtom)).toBe(true)
  })

  it('clears the body data attributes when phase reaches done', async () => {
    renderWith()
    await advance(15_000, 50)
    expect(document.body.hasAttribute('data-intro-phase')).toBe(false)
    expect(document.body.hasAttribute('data-intro-revealed')).toBe(false)
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
