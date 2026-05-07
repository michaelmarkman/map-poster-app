import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mocks for the three deps ProtectedRoute pulls in.
let mockUser = null
let mockLoading = false
let mockGuest = false
let mockSupabase = { /* truthy = configured */ }
const mockEnterGuestMode = vi.fn()

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, loading: mockLoading }),
}))
vi.mock('../../lib/supabase', () => ({
  get supabase() { return mockSupabase },
}))
vi.mock('../../lib/guestMode', () => ({
  enterGuestMode: () => mockEnterGuestMode(),
  useGuestMode: () => mockGuest,
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    Navigate: ({ to }) => <div data-testid="redirect">redirect → {to}</div>,
  }
})

import ProtectedRoute from '../ProtectedRoute'

function renderWith({ guestAllowed = false } = {}) {
  return render(
    <MemoryRouter>
      <ProtectedRoute guestAllowed={guestAllowed}>
        <div data-testid="content">protected content</div>
      </ProtectedRoute>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockUser = null
    mockLoading = false
    mockGuest = false
    mockSupabase = {} // configured by default
    mockEnterGuestMode.mockReset()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders children for a logged-in user', () => {
    mockUser = { id: 'u1' }
    renderWith()
    expect(screen.getByTestId('content')).toBeDefined()
  })

  it('renders children when supabase is unconfigured (no auth backend)', () => {
    mockSupabase = null
    mockUser = null
    renderWith()
    // No login redirect, no spinner — just children.
    expect(screen.getByTestId('content')).toBeDefined()
  })

  it('shows loading spinner while auth is resolving', () => {
    mockLoading = true
    const { container } = renderWith()
    // Spinner is a div with animation: spin — there's no semantic role,
    // but the children should NOT have rendered yet.
    expect(screen.queryByTestId('content')).toBe(null)
    // And no redirect either
    expect(screen.queryByTestId('redirect')).toBe(null)
    // The container should have the wrapper div with the styled spinner
    expect(container.firstChild).toBeDefined()
  })

  it('redirects unauth visitors to /login when guestAllowed is false', () => {
    mockUser = null
    renderWith({ guestAllowed: false })
    const node = screen.getByTestId('redirect')
    expect(node.textContent).toContain('/login')
    expect(screen.queryByTestId('content')).toBe(null)
  })

  it('renders children for guests when guestAllowed is true', () => {
    mockUser = null
    mockGuest = true
    renderWith({ guestAllowed: true })
    expect(screen.getByTestId('content')).toBeDefined()
  })

  it('flips guest mode on for direct /app visits (guestAllowed + no user yet)', () => {
    mockUser = null
    mockGuest = false
    mockLoading = false
    renderWith({ guestAllowed: true })
    // useEffect fires after the first render; flushed by render()
    expect(mockEnterGuestMode).toHaveBeenCalled()
  })

  it('does NOT flip guest mode while auth is still loading', () => {
    mockLoading = true
    renderWith({ guestAllowed: true })
    expect(mockEnterGuestMode).not.toHaveBeenCalled()
  })

  it('does NOT flip guest mode for routes that disallow guests', () => {
    mockUser = null
    renderWith({ guestAllowed: false })
    expect(mockEnterGuestMode).not.toHaveBeenCalled()
  })
})
