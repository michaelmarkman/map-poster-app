import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReadoutPill from '../components/ReadoutPill'

// jsdom's PointerEvent support is partial — the drag flow itself is
// exercised end-to-end by the smoke test (Playwright drives a real
// browser). Here we cover what doesn't depend on PointerEvent:
// rendering, formatting, divider class placement, accessibility.

function makeSeg(overrides = {}) {
  return {
    key: 'focal',
    label: 'Focal length',
    value: 35,
    setValue: vi.fn(),
    min: 14,
    max: 200,
    scale: 0.5,
    format: (v) => `${Math.round(v)}mm`,
    ...overrides,
  }
}

describe('ReadoutPill', () => {
  it('renders one segment per item with formatted readout', () => {
    render(
      <ReadoutPill
        segments={[
          makeSeg({ key: 'focal', value: 35, format: (v) => `${Math.round(v)}mm` }),
          makeSeg({ key: 'aperture', value: 4.5, format: (v) => `f/${v.toFixed(1)}` }),
        ]}
      />,
    )
    expect(screen.getByText('35mm')).toBeDefined()
    expect(screen.getByText('f/4.5')).toBeDefined()
  })

  it('exposes each segment with an aria-label including label + value', () => {
    render(<ReadoutPill segments={[makeSeg({ key: 'focal', value: 35 })]} />)
    const btn = screen.getByRole('button', { name: /Focal length 35mm/ })
    expect(btn).toBeDefined()
  })

  it('reflects value updates from the parent', () => {
    const { rerender } = render(
      <ReadoutPill segments={[makeSeg({ value: 35 })]} />,
    )
    expect(screen.getByText('35mm')).toBeDefined()
    rerender(<ReadoutPill segments={[makeSeg({ value: 85 })]} />)
    expect(screen.getByText('85mm')).toBeDefined()
  })

  it('renders the OFF readout when the format function says so', () => {
    // Aperture's format renders 'f/—' when value === 0 (the OFF detent
    // for the cluster pill). The component itself doesn't know about
    // that — it just calls the format function. Verifying that the
    // string round-trips proves the integration point is intact.
    render(
      <ReadoutPill
        segments={[
          makeSeg({
            key: 'aperture',
            value: 0,
            format: (v) => (v <= 0 ? 'f/—' : `f/${v.toFixed(1)}`),
          }),
        ]}
      />,
    )
    expect(screen.getByText('f/—')).toBeDefined()
  })

  it('only the last segment lacks the divider class', () => {
    const { container } = render(
      <ReadoutPill
        segments={[
          makeSeg({ key: 'a' }),
          makeSeg({ key: 'b' }),
          makeSeg({ key: 'c' }),
        ]}
      />,
    )
    const segs = container.querySelectorAll('.mock-readout-segment')
    expect(segs).toHaveLength(3)
    expect(segs[0].classList.contains('has-divider')).toBe(true)
    expect(segs[1].classList.contains('has-divider')).toBe(true)
    expect(segs[2].classList.contains('has-divider')).toBe(false)
  })

  it('wraps everything in a role="group" with a Camera readout label', () => {
    const { container } = render(
      <ReadoutPill segments={[makeSeg(), makeSeg({ key: 'b' })]} />,
    )
    const group = container.querySelector('[role="group"]')
    expect(group).toBeDefined()
    expect(group.getAttribute('aria-label')).toBe('Camera readout')
  })

  it('renders zero segments without crashing', () => {
    const { container } = render(<ReadoutPill segments={[]} />)
    expect(container.querySelectorAll('.mock-readout-segment')).toHaveLength(0)
  })

  it('passes through className on the wrapper', () => {
    const { container } = render(
      <ReadoutPill segments={[makeSeg()]} className="custom-class" />,
    )
    const wrapper = container.querySelector('.mock-readout-pill')
    expect(wrapper.classList.contains('custom-class')).toBe(true)
  })
})
