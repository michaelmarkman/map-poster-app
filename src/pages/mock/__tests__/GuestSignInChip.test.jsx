import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let mockUser = null
let mockGuest = false
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}))
vi.mock('../../../lib/guestMode', () => ({
  useGuestMode: () => mockGuest,
}))

import GuestSignInChip from '../components/GuestSignInChip'

function renderChip() {
  return render(
    <MemoryRouter>
      <GuestSignInChip />
    </MemoryRouter>,
  )
}

describe('GuestSignInChip', () => {
  beforeEach(() => {
    mockUser = null
    mockGuest = false
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing for unauth users that are NOT guests', () => {
    const { container } = renderChip()
    expect(container.firstChild).toBe(null)
  })

  it('renders nothing for logged-in users (guest flag is moot)', () => {
    mockUser = { id: 'u1' }
    mockGuest = true
    const { container } = renderChip()
    expect(container.firstChild).toBe(null)
  })

  it('renders Sign in for guest users', () => {
    mockGuest = true
    renderChip()
    const link = screen.getByRole('link', { name: /Sign in/i })
    expect(link).toBeDefined()
    expect(link.getAttribute('href')).toBe('/login')
  })

  it('flushes session-persistence on click (SPA-nav cant trigger beforeunload)', () => {
    mockGuest = true
    const events = []
    const handler = (e) => events.push(e.type)
    window.addEventListener('save-session', handler)
    try {
      renderChip()
      fireEvent.click(screen.getByRole('link', { name: /Sign in/i }))
      expect(events).toEqual(['save-session'])
    } finally {
      window.removeEventListener('save-session', handler)
    }
  })

  it('has an aria-label for screen readers', () => {
    mockGuest = true
    renderChip()
    expect(screen.getByLabelText(/Sign in to save your work/i)).toBeDefined()
  })
})
