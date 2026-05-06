import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let mockUser = null
let mockProfile = null
let mockGuest = false
const mockSignOut = vi.fn(() => Promise.resolve())
const mockNavigate = vi.fn()

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    profile: mockProfile,
    signOut: mockSignOut,
  }),
}))
vi.mock('../../../lib/guestMode', () => ({
  useGuestMode: () => mockGuest,
}))
vi.mock('react-router-dom', async () => {
  const real = await vi.importActual('react-router-dom')
  return {
    ...real,
    useNavigate: () => mockNavigate,
  }
})

import AccountChip from '../components/AccountChip'

function renderChip() {
  return render(
    <MemoryRouter>
      <AccountChip />
    </MemoryRouter>,
  )
}

describe('AccountChip', () => {
  beforeEach(() => {
    mockUser = null
    mockProfile = null
    mockGuest = false
    mockSignOut.mockClear()
    mockNavigate.mockClear()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing for unauth users that are NOT guests', () => {
    const { container } = renderChip()
    expect(container.firstChild).toBe(null)
  })

  it('renders a placeholder glyph for guests', () => {
    mockGuest = true
    renderChip()
    const btn = screen.getByLabelText('Account menu')
    expect(btn.textContent).toBe('·')
  })

  it("renders the user's first initial when logged in without an avatar", () => {
    mockUser = { email: 'alice@example.com' }
    mockProfile = { display_name: 'Alice' }
    renderChip()
    const btn = screen.getByLabelText('Account menu')
    expect(btn.textContent).toBe('A')
  })

  it('renders the avatar image when profile.avatar_url is set', () => {
    mockUser = { email: 'a@b.co' }
    mockProfile = { avatar_url: 'https://x/x.png' }
    renderChip()
    const img = screen.getByLabelText('Account menu').querySelector('img')
    expect(img).toBeDefined()
    expect(img.src).toBe('https://x/x.png')
  })

  it('opens the dropdown on click and closes on Esc', () => {
    mockUser = { email: 'a@b.co' }
    mockProfile = { display_name: 'Alice' }
    renderChip()
    const btn = screen.getByLabelText('Account menu')
    expect(screen.queryByRole('menu')).toBe(null)
    fireEvent.click(btn)
    expect(screen.getByRole('menu')).toBeDefined()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBe(null)
  })

  it('logged-in dropdown shows display name + email + My Gallery / Profile / Sign out', () => {
    mockUser = { email: 'alice@example.com' }
    mockProfile = { display_name: 'Alice' }
    renderChip()
    fireEvent.click(screen.getByLabelText('Account menu'))
    expect(screen.getByText('Alice')).toBeDefined()
    expect(screen.getByText('alice@example.com')).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'My Gallery' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeDefined()
  })

  it('guest dropdown shows Sign in + Sign up', () => {
    mockGuest = true
    renderChip()
    fireEvent.click(screen.getByLabelText('Account menu'))
    expect(screen.getByText('Guest')).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'Sign in' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'Sign up' })).toBeDefined()
  })

  it('flushes the session save before navigation when a menu link is clicked', () => {
    mockUser = { email: 'a@b.co' }
    mockProfile = { display_name: 'Alice' }
    const saves = []
    const handler = () => saves.push(Date.now())
    window.addEventListener('save-session', handler)
    try {
      renderChip()
      fireEvent.click(screen.getByLabelText('Account menu'))
      fireEvent.click(screen.getByRole('menuitem', { name: 'My Gallery' }))
      expect(saves.length).toBe(1)
    } finally {
      window.removeEventListener('save-session', handler)
    }
  })

  it('Sign out: flushes save, calls signOut, navigates to /', async () => {
    mockUser = { email: 'a@b.co' }
    mockProfile = { display_name: 'Alice' }
    const saves = []
    const handler = () => saves.push(1)
    window.addEventListener('save-session', handler)
    try {
      renderChip()
      fireEvent.click(screen.getByLabelText('Account menu'))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
      // signOut is async; let microtasks flush.
      await Promise.resolve()
      await Promise.resolve()
      expect(saves.length).toBe(1)
      expect(mockSignOut).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/')
    } finally {
      window.removeEventListener('save-session', handler)
    }
  })

  it('outside-click closes the dropdown', () => {
    mockUser = { email: 'a@b.co' }
    mockProfile = { display_name: 'Alice' }
    renderChip()
    fireEvent.click(screen.getByLabelText('Account menu'))
    expect(screen.getByRole('menu')).toBeDefined()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBe(null)
  })
})
