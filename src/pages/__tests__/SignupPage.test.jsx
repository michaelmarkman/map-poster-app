import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockSignUp = vi.fn()
const mockEnterGuestMode = vi.fn()
const mockNavigate = vi.fn()
let mockUser = null

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, signUp: mockSignUp }),
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

import SignupPage from '../SignupPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>,
  )
}

async function fillAndSubmit({ username = 'alice42', email = 'a@b.com', password = 'secret123' } = {}) {
  fireEvent.change(screen.getByLabelText(/Username/), { target: { value: username } })
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(/Password/), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: /Create account/ }))
}

describe('SignupPage', () => {
  beforeEach(() => {
    mockSignUp.mockReset()
    mockEnterGuestMode.mockReset()
    mockNavigate.mockReset()
    mockUser = null
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders username + email + password + submit', () => {
    renderPage()
    expect(screen.getByLabelText(/Username/)).toBeDefined()
    expect(screen.getByLabelText(/Email/)).toBeDefined()
    expect(screen.getByLabelText(/Password/)).toBeDefined()
    expect(screen.getByRole('button', { name: /Create account/ })).toBeDefined()
  })

  it('redirects logged-in users to /app', () => {
    mockUser = { id: 'u1' }
    renderPage()
    expect(screen.getByTestId('redirect').textContent).toContain('/app')
  })

  it('rejects usernames < 3 chars without calling signUp', async () => {
    renderPage()
    await fillAndSubmit({ username: 'ab' })
    expect(screen.getByText(/at least 3 characters/i)).toBeDefined()
    expect(mockSignUp).not.toHaveBeenCalled()
  })

  it('rejects usernames with non-alphanumeric chars (besides _)', async () => {
    renderPage()
    await fillAndSubmit({ username: 'hello world' })
    expect(screen.getByText(/letters, numbers, and underscores/i)).toBeDefined()
    expect(mockSignUp).not.toHaveBeenCalled()
  })

  it('rejects usernames longer than 24 chars without calling signUp', async () => {
    renderPage()
    await fillAndSubmit({ username: 'a'.repeat(25) })
    expect(screen.getByText(/24 characters or fewer/i)).toBeDefined()
    expect(mockSignUp).not.toHaveBeenCalled()
  })

  it('signs up + shows the check-your-email confirmation on success', async () => {
    mockSignUp.mockResolvedValueOnce()
    renderPage()
    await fillAndSubmit()
    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith('a@b.com', 'secret123', 'alice42'))
    expect(screen.getByText(/Check your email/)).toBeDefined()
    // The success view replaces the form, so the submit button should be gone.
    expect(screen.queryByRole('button', { name: /Create account/ })).toBe(null)
  })

  it('routes Supabase errors through friendlyError', async () => {
    mockSignUp.mockRejectedValueOnce(new Error('User already registered'))
    renderPage()
    await fillAndSubmit()
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeDefined())
    // Stays on the form (no Check-your-email yet)
    expect(screen.queryByText(/Check your email/)).toBe(null)
  })

  it('Skip — try as guest enters guest mode + navigates to /app', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Skip — try as guest/ }))
    expect(mockEnterGuestMode).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/app')
  })
})
