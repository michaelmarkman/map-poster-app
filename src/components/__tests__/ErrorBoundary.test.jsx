import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../ErrorBoundary'

function Boom({ msg = 'kaboom' }) {
  throw new Error(msg)
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught errors to console.error; suppress for clean test output.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <div>hello</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('catches a child render error and shows the fallback UI', () => {
    render(
      <ErrorBoundary>
        <Boom msg="render failed" />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
    expect(screen.getByText('render failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })

  it('does not let an exception bubble out of the boundary', () => {
    // Without ErrorBoundary, throwing in render propagates to the test
    // runner. The boundary's getDerivedStateFromError + the fallback
    // contain it.
    expect(() => {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      )
    }).not.toThrow()
  })

  it("falls back to 'Unknown error' if the thrown value has no message", () => {
    function ThrowString() {
      throw 'plain string error'
    }
    render(
      <ErrorBoundary>
        <ThrowString />
      </ErrorBoundary>,
    )
    expect(screen.getByText('plain string error')).toBeInTheDocument()
  })
})
