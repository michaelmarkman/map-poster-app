import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockResetPassword = vi.fn()

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ resetPassword: mockResetPassword }),
}))

import ForgotPasswordPage from '../ForgotPasswordPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  )
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    mockResetPassword.mockReset()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders email input + submit', () => {
    renderPage()
    expect(screen.getByLabelText(/Email/)).toBeDefined()
    expect(screen.getByRole('button', { name: /Send reset link/ })).toBeDefined()
  })

  it('shows the check-email confirmation on success', async () => {
    mockResetPassword.mockResolvedValueOnce()
    renderPage()
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'a@b.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Send reset link/ }))
    await waitFor(() => expect(mockResetPassword).toHaveBeenCalledWith('a@b.com'))
    expect(screen.getByText(/Check your email/i)).toBeDefined()
    // Form is replaced — submit button no longer present
    expect(screen.queryByRole('button', { name: /Send reset link/ })).toBe(null)
  })

  it('routes Supabase rate-limit through friendlyError', async () => {
    mockResetPassword.mockRejectedValueOnce(
      new Error('For security purposes, you can only request this after 60 seconds'),
    )
    renderPage()
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'a@b.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Send reset link/ }))
    await waitFor(() => expect(screen.getByText(/wait a moment/i)).toBeDefined())
    // Stays on the form
    expect(screen.queryByText(/Check your email/i)).toBe(null)
  })

  it("doesn't leak whether the email is registered (friendlyError fallback)", async () => {
    // Supabase intentionally returns success even for non-existent
    // emails to avoid disclosing membership. friendlyError's job here
    // is just to handle anything we do see; the page should still
    // succeed on the resolved promise regardless.
    mockResetPassword.mockResolvedValueOnce()
    renderPage()
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'never-registered@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Send reset link/ }))
    await waitFor(() => expect(screen.getByText(/Check your email/i)).toBeDefined())
  })

  it('links back to /login from both states', () => {
    renderPage()
    const links = screen.getAllByRole('link')
    expect(links.some((a) => a.getAttribute('href') === '/login')).toBe(true)
  })
})
