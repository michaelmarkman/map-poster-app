import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// jsdom doesn't ship matchMedia. Navbar uses it to close the mobile
// drawer when the viewport crosses the desktop breakpoint. Stub it
// as a no-op so render() doesn't throw.
window.matchMedia = window.matchMedia || function () {
  return {
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }
}

const mockSignOut = vi.fn()
const mockNavigate = vi.fn()
let mockUser = null
let mockProfile = null

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, profile: mockProfile, signOut: mockSignOut }),
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import Navbar from '../Navbar'

function renderNavbar() {
  return render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>,
  )
}

describe('Navbar', () => {
  beforeEach(() => {
    mockSignOut.mockReset()
    mockNavigate.mockReset()
    mockUser = null
    mockProfile = null
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Vedute wordmark (SVG) linking to /', () => {
    renderNavbar()
    // The wordmark moved from text → /wordmark.svg in Phase 2.7. The
    // <Link> still aria-labels itself "Vedute home" for screen readers.
    const link = screen.getByLabelText('Vedute home')
    expect(link.getAttribute('href')).toBe('/')
    const img = link.querySelector('img')
    expect(img).toBeDefined()
    expect(img.getAttribute('alt')).toBe('Vedute')
  })

  it('Create + Community links route via React Router (not prototype HTML)', () => {
    renderNavbar()
    const links = screen.getAllByRole('link')
    const hrefs = links.map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/app')
    expect(hrefs).toContain('/community')
    // Locks the Phase 1.2 fix that repointed these away from
    // /prototypes/*.html — a regression here would silently send
    // users back to the old MapPoster pages.
    expect(hrefs).not.toContain('/prototypes/poster-v3-ui.html')
    expect(hrefs).not.toContain('/prototypes/community.html')
  })

  it('shows Sign in + Sign up for guests', () => {
    renderNavbar()
    expect(screen.getByText('Sign in')).toBeDefined()
    expect(screen.getByText('Sign up')).toBeDefined()
  })

  it('shows the avatar + dropdown for logged-in users', () => {
    mockUser = { id: 'u1', email: 'alice@example.com' }
    mockProfile = { display_name: 'Alice', username: 'alice42' }
    renderNavbar()
    // Initials taken from display_name
    expect(screen.getAllByText('A').length).toBeGreaterThan(0)
    // Sign in / Sign up should NOT be present for logged-in users
    expect(screen.queryByText('Sign in')).toBe(null)
  })

  it('signing out calls signOut + navigates to /', async () => {
    mockUser = { id: 'u1', email: 'alice@example.com' }
    mockProfile = { display_name: 'Alice' }
    mockSignOut.mockResolvedValueOnce()
    renderNavbar()
    // Open the dropdown
    fireEvent.click(screen.getAllByText('A')[0])
    fireEvent.click(screen.getByText('Sign out'))
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('falls back to email-initial when neither display_name nor username is set', () => {
    mockUser = { id: 'u1', email: 'cathy@example.com' }
    mockProfile = null
    renderNavbar()
    expect(screen.getAllByText('C').length).toBeGreaterThan(0)
  })

  it('avatar trigger is a button, keyboard-focusable, with aria-haspopup', () => {
    mockUser = { id: 'u1', email: 'alice@example.com' }
    mockProfile = { display_name: 'Alice' }
    renderNavbar()
    const trigger = screen.getByRole('button', { name: /Account menu/i })
    expect(trigger).toBeDefined()
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    // aria-expanded flips when the menu opens.
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('Esc closes the open dropdown', () => {
    mockUser = { id: 'u1', email: 'alice@example.com' }
    mockProfile = { display_name: 'Alice' }
    renderNavbar()
    const trigger = screen.getByRole('button', { name: /Account menu/i })
    fireEvent.click(trigger)
    expect(screen.getByText('Sign out')).toBeDefined()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Sign out')).toBe(null)
  })
})
