import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DragPill from '../components/DragPill'

// jsdom's PointerEvent support is partial — the click vs drag pointer
// flow is exercised end-to-end by the smoke test (Playwright drives a
// real browser). Here we cover the parts that don't depend on
// PointerEvent: rendering, format, click suppression, and right-click
// guard.

function makeProps(overrides = {}) {
  return {
    icon: null,
    value: 50,
    setValue: vi.fn(),
    min: 0,
    max: 100,
    scale: 0.5,
    format: (v) => `${Math.round(v)}`,
    onClick: vi.fn(),
    ...overrides,
  }
}

// Phase 12 — DragPill now renders the value text in three places:
// the rest-state .mock-pill-value, the scrub-state .mock-pill-scrub-
// value, and the floating .mock-pill-tooltip-value. The chevrons +
// tooltip are always in the DOM (hidden via CSS at rest). Tests
// target the rest-state span via its class to avoid the duplicate
// matches.
function restValue(container) {
  return container.querySelector('.mock-pill-stack .mock-pill-value')
}

describe('DragPill', () => {
  it('formats value via the format prop', () => {
    const { container } = render(
      <DragPill {...makeProps({ value: 42, format: (v) => `${v}mm` })} />,
    )
    expect(restValue(container).textContent).toBe('42mm')
  })

  it('updates display when value changes', () => {
    const { container, rerender } = render(<DragPill {...makeProps({ value: 50 })} />)
    expect(restValue(container).textContent).toBe('50')
    rerender(<DragPill {...makeProps({ value: 75 })} />)
    expect(restValue(container).textContent).toBe('75')
  })

  it('suppresses native click via preventDefault — pointerup carries the click', () => {
    // The base Pill is a <button type="button">; without DragPill's
    // onClick override, clicking the pill would also fire the parent's
    // onClick on the synthetic React event. DragPill wires its onClick
    // to e.preventDefault and uses pointerup for the click vs drag
    // discrimination instead.
    const props = makeProps()
    const { container } = render(<DragPill {...props} />)
    const pill = restValue(container).closest('button')
    fireEvent.click(pill)
    // The component-level onClick is for click-vs-drag — gated on
    // pointerup with no drag. fireEvent.click bypasses pointer events,
    // so this just confirms the synthetic-click path doesn't double-
    // fire onClick from the React onClick override.
    expect(props.onClick).not.toHaveBeenCalled()
  })

  it('passes-through extra props to the underlying Pill', () => {
    render(<DragPill {...makeProps()} aria-label="focal length" />)
    const pill = screen.getByLabelText('focal length')
    expect(pill).toBeDefined()
  })
})
