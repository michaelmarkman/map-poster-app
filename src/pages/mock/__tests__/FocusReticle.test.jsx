import { describe, it, expect } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import FocusReticle from '../components/FocusReticle'

describe('FocusReticle', () => {
  it('renders hidden at rest', () => {
    const { container } = render(<FocusReticle />)
    const reticle = container.querySelector('.mock-reticle')
    expect(reticle).not.toBe(null)
    expect(reticle.classList.contains('is-focusing')).toBe(false)
  })

  it('renders the bracket and focus dot', () => {
    const { container } = render(<FocusReticle />)
    expect(container.querySelector('.mock-reticle-bracket')).not.toBe(null)
    expect(container.querySelector('.mock-reticle-center')).not.toBe(null)
    expect(container.querySelector('.mock-reticle-label')).not.toBe(null)
  })

  it('marks itself aria-hidden — it is decorative', () => {
    const { container } = render(<FocusReticle />)
    const reticle = container.querySelector('.mock-reticle')
    expect(reticle.getAttribute('aria-hidden')).toBe('true')
  })

  it('positions + activates on `focus-tap` event', async () => {
    const { container } = render(<FocusReticle />)
    const reticle = container.querySelector('.mock-reticle')
    expect(reticle.classList.contains('is-focusing')).toBe(false)

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('focus-tap', { detail: { x: 420, y: 240 } }),
      )
    })
    // The component uses requestAnimationFrame to flip from
    // is-focusing=false → true; wait for it.
    await waitFor(() => {
      expect(reticle.classList.contains('is-focusing')).toBe(true)
    })
    expect(reticle.style.left).toBe('420px')
    expect(reticle.style.top).toBe('240px')
  })

  it('ignores `focus-tap` events with missing coords', async () => {
    const { container } = render(<FocusReticle />)
    const reticle = container.querySelector('.mock-reticle')
    await act(async () => {
      window.dispatchEvent(new CustomEvent('focus-tap', { detail: {} }))
    })
    // Give rAF a chance to fire before asserting nothing happened.
    await new Promise((r) => setTimeout(r, 20))
    expect(reticle.classList.contains('is-focusing')).toBe(false)
  })
})
