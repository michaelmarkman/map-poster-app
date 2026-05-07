import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import HoverPopoverPill from '../components/HoverPopoverPill'

// jsdom doesn't have a real (pointer: coarse) media query — default to
// fine-pointer (desktop) unless a test overrides.
function setMatchMedia({ coarse = false } = {}) {
  window.matchMedia = (q) => ({
    matches: q.includes('coarse') ? coarse : false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  })
}

describe('HoverPopoverPill', () => {
  beforeEach(() => {
    setMatchMedia()
  })
  afterEach(() => {
    delete window.matchMedia
  })

  it('renders the label as a button with toggle ARIA', () => {
    render(<HoverPopoverPill label="DoF" active>panel</HoverPopoverPill>)
    const btn = screen.getByRole('button', { name: 'DoF' })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(btn.getAttribute('aria-haspopup')).toBe('true')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  it('aria-pressed flips with the active prop', () => {
    const { rerender } = render(
      <HoverPopoverPill label="x">panel</HoverPopoverPill>,
    )
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('false')
    rerender(<HoverPopoverPill label="x" active>panel</HoverPopoverPill>)
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true')
  })

  it('hovering the wrap opens the popover (desktop / fine pointer)', () => {
    const { container } = render(
      <HoverPopoverPill label="x" active>
        panel-content
      </HoverPopoverPill>,
    )
    expect(screen.queryByText('panel-content')).toBe(null)
    fireEvent.pointerEnter(container.querySelector('.mock-hover-pill-wrap'))
    expect(screen.getByText('panel-content')).toBeDefined()
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true')
  })

  it('alwaysShowPopover opens hover even when not active', () => {
    const { container } = render(
      <HoverPopoverPill label="x" alwaysShowPopover>
        panel-content
      </HoverPopoverPill>,
    )
    fireEvent.pointerEnter(container.querySelector('.mock-hover-pill-wrap'))
    expect(screen.getByText('panel-content')).toBeDefined()
  })

  it('does NOT open hover when inactive and !alwaysShowPopover', () => {
    const { container } = render(
      <HoverPopoverPill label="x">panel-content</HoverPopoverPill>,
    )
    fireEvent.pointerEnter(container.querySelector('.mock-hover-pill-wrap'))
    expect(screen.queryByText('panel-content')).toBe(null)
  })

  it('clicking the pill calls onToggle (and on coarse pointers also opens the popover)', () => {
    setMatchMedia({ coarse: true })
    const onToggle = vi.fn()
    render(
      <HoverPopoverPill label="x" onToggle={onToggle} alwaysShowPopover>
        panel-content
      </HoverPopoverPill>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(screen.getByText('panel-content')).toBeDefined()
  })

  it("Esc closes the popover when it's open on a coarse pointer", () => {
    setMatchMedia({ coarse: true })
    render(
      <HoverPopoverPill label="x" alwaysShowPopover>
        panel-content
      </HoverPopoverPill>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('panel-content')).toBeDefined()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('panel-content')).toBe(null)
  })
})
