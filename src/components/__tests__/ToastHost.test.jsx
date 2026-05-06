import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import ToastHost from '../ToastHost'

describe('ToastHost', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing initially', () => {
    const { container } = render(<ToastHost />)
    expect(container.firstChild).toBe(null)
  })

  it('shows a toast on toast event', () => {
    render(<ToastHost />)
    act(() => {
      window.dispatchEvent(new CustomEvent('toast', {
        detail: { type: 'success', message: 'View saved!' },
      }))
    })
    expect(screen.getByText('View saved!')).toBeDefined()
  })

  it('auto-dismisses after the TTL', () => {
    render(<ToastHost />)
    act(() => {
      window.dispatchEvent(new CustomEvent('toast', {
        detail: { type: 'success', message: 'Auto goes' },
      }))
    })
    expect(screen.getByText('Auto goes')).toBeDefined()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.queryByText('Auto goes')).toBe(null)
  })

  it('caps the visible stack at MAX_TOASTS', () => {
    render(<ToastHost />)
    act(() => {
      for (let i = 0; i < 6; i++) {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: { type: 'info', message: `msg-${i}` },
        }))
      }
    })
    // Stack capped at 3; oldest get pushed out — only the last 3 visible.
    expect(screen.queryByText('msg-0')).toBe(null)
    expect(screen.queryByText('msg-2')).toBe(null)
    expect(screen.getByText('msg-3')).toBeDefined()
    expect(screen.getByText('msg-4')).toBeDefined()
    expect(screen.getByText('msg-5')).toBeDefined()
  })

  it('ignores events with no message', () => {
    const { container } = render(<ToastHost />)
    act(() => {
      window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'info' } }))
    })
    expect(container.firstChild).toBe(null)
  })

  it('applies a CSS class for each toast type', () => {
    render(<ToastHost />)
    act(() => {
      window.dispatchEvent(new CustomEvent('toast', {
        detail: { type: 'error', message: 'Oh no' },
      }))
    })
    const el = screen.getByText('Oh no')
    expect(el.className).toMatch(/vd-toast--error/)
  })
})
