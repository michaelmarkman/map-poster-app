import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PopoverPill from '../components/PopoverPill'

describe('PopoverPill', () => {
  it('renders the label as a button with menu ARIA', () => {
    render(<PopoverPill label="Saved views">panel</PopoverPill>)
    const btn = screen.getByRole('button', { name: 'Saved views' })
    expect(btn.getAttribute('aria-haspopup')).toBe('true')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  it('clicking the pill toggles the popover open / closed', () => {
    render(<PopoverPill label="x">panel-content</PopoverPill>)
    expect(screen.queryByText('panel-content')).toBe(null)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('panel-content')).toBeDefined()
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('panel-content')).toBe(null)
  })

  it('Esc closes an open popover', () => {
    render(<PopoverPill label="x">panel-content</PopoverPill>)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('panel-content')).toBeDefined()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('panel-content')).toBe(null)
  })

  it('outside pointerdown closes an open popover', () => {
    render(
      <div>
        <span data-testid="outside">elsewhere</span>
        <PopoverPill label="x">panel-content</PopoverPill>
      </div>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('panel-content')).toBeDefined()
    fireEvent.pointerDown(screen.getByTestId('outside'))
    expect(screen.queryByText('panel-content')).toBe(null)
  })

  it('children-as-function gets a `close` callback', () => {
    const closeSpy = vi.fn()
    render(
      <PopoverPill label="x">
        {({ close }) => (
          <button
            type="button"
            onClick={() => {
              closeSpy()
              close()
            }}
          >
            close-me
          </button>
        )}
      </PopoverPill>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'x' }))
    fireEvent.click(screen.getByRole('button', { name: 'close-me' }))
    expect(closeSpy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'close-me' })).toBe(null)
  })

  it('the `active` prop forces the pill into is-active even when closed', () => {
    const { container } = render(
      <PopoverPill label="x" active>
        panel
      </PopoverPill>,
    )
    expect(container.querySelector('.mock-pill.is-active')).toBeDefined()
  })
})
