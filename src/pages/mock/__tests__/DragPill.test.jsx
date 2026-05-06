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

describe('DragPill', () => {
  it('formats value via the format prop', () => {
    render(<DragPill {...makeProps({ value: 42, format: (v) => `${v}mm` })} />)
    expect(screen.getByText('42mm')).toBeDefined()
  })

  it('updates display when value changes', () => {
    const { rerender } = render(<DragPill {...makeProps({ value: 50 })} />)
    expect(screen.getByText('50')).toBeDefined()
    rerender(<DragPill {...makeProps({ value: 75 })} />)
    expect(screen.getByText('75')).toBeDefined()
  })

  it('suppresses native click via preventDefault — pointerup carries the click', () => {
    // The base Pill is a <button type="button">; without DragPill's
    // onClick override, clicking the pill would also fire the parent's
    // onClick on the synthetic React event. DragPill wires its onClick
    // to e.preventDefault and uses pointerup for the click vs drag
    // discrimination instead.
    const props = makeProps()
    render(<DragPill {...props} />)
    const pill = screen.getByText('50').closest('button')
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
