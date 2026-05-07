import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockSignIn = vi.fn()
const mockNavigate = vi.fn()
const mockEnterGuestMode = vi.fn()
let mockUser = null

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, signIn: mockSignIn }),
}))
vi.mock('../../lib/guestMode', () => ({
  enterGuestMode: () => mockEnterGuestMode(),
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Navigate: ({ to }) => <div data-testid="redirect">redirect → {to}</div>,
  }
})

import LoginPage from '../LoginPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    mockSignIn.mockReset()
    mockNavigate.mockReset()
    mockEnterGuestMode.mockReset()
    mockUser = null
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders email + password + sign-in', () => {
    renderPage()
    expect(screen.getByLabelText(/Email/)).toBeDefined()
    expect(screen.getByLabelText(/Password/)).toBeDefined()
    expect(screen.getByRole('button', { name: /Sign in/ })).toBeDefined()
  })

  it('redirects logged-in users to /app', () => {
    mockUser = { id: 'u1' }
    renderPage()
    const node = screen.getByTestId('redirect')
    expect(node.textContent).toContain('/app')
  })

  it('signs in + navigates to /app on success', async () => {
    mockSignIn.mockResolvedValueOnce()
    renderPage()
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /Sign in/ }))
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('a@b.com', 'secret123'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/app'))
  })

  it('routes Supabase errors through friendlyError', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('Invalid login credentials'))
    renderPage()
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /Sign in/ }))
    await waitFor(() => expect(screen.getByText(/Incorrect email or password/i)).toBeDefined())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('Continue as guest enters guest mode + navigates to /app', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Continue as guest/ }))
    expect(mockEnterGuestMode).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/app')
  })

  it('shows links to /signup and /forgot-password', () => {
    renderPage()
    const links = screen.getAllByRole('link')
    const hrefs = links.map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/signup')
    expect(hrefs).toContain('/forgot-password')
  })
})
