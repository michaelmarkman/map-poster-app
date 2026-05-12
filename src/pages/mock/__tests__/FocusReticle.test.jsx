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

  // Phase 15 — real-distance rangefinder readout. Scene's
  // ClickToFocus raycasts and emits the distance on the focus-tap
  // event detail; FocusReticle formats it with the rangefinder
  // rules: <1km → "N m", 1-10km → "N.N km", ≥10km → "N km".
  // Sky-tap (no geometry hit) sends distance=null → label is "∞".
  describe('rangefinder readout', () => {
    async function emit(detail) {
      await act(async () => {
        window.dispatchEvent(new CustomEvent('focus-tap', { detail }))
      })
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 5)))
    }

    it('formats sub-1km distances as integer meters', async () => {
      const { container } = render(<FocusReticle />)
      await emit({ x: 100, y: 100, distance: 412.7 })
      const label = container.querySelector('.mock-reticle-label')
      expect(label.textContent).toMatch(/413 m/)
    })

    it('formats 1-9.9km distances as N.N km', async () => {
      const { container } = render(<FocusReticle />)
      await emit({ x: 100, y: 100, distance: 1400 })
      const label = container.querySelector('.mock-reticle-label')
      expect(label.textContent).toMatch(/1\.4 km/)
    })

    it('formats >=10km distances as integer km', async () => {
      const { container } = render(<FocusReticle />)
      await emit({ x: 100, y: 100, distance: 12345 })
      const label = container.querySelector('.mock-reticle-label')
      expect(label.textContent).toMatch(/12 km/)
    })

    it('shows ∞ when distance is null (ray missed geometry)', async () => {
      const { container } = render(<FocusReticle />)
      await emit({ x: 100, y: 100, distance: null })
      const label = container.querySelector('.mock-reticle-label')
      expect(label.textContent).toMatch(/∞/)
    })

    it('shows ∞ when distance is omitted (pre-Phase-15 / tests)', async () => {
      const { container } = render(<FocusReticle />)
      await emit({ x: 100, y: 100 })
      const label = container.querySelector('.mock-reticle-label')
      expect(label.textContent).toMatch(/∞/)
    })
  })
})
