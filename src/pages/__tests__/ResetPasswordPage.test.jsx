import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock useAuth — the page only consumes updatePassword from it.
const mockUpdatePassword = vi.fn()
const mockNavigate = vi.fn()

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ updatePassword: mockUpdatePassword }),
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import ResetPasswordPage from '../ResetPasswordPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <ResetPasswordPage />
    </MemoryRouter>,
  )
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    mockUpdatePassword.mockReset()
    mockNavigate.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('renders the form with both password inputs', () => {
    renderPage()
    expect(screen.getByLabelText(/^New password/)).toBeDefined()
    expect(screen.getByLabelText(/Confirm password/)).toBeDefined()
    expect(screen.getByRole('button', { name: /Update password/ })).toBeDefined()
  })

  it('rejects passwords shorter than 6 chars', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: '12345' } })
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: '12345' } })
    fireEvent.click(screen.getByRole('button', { name: /Update password/ }))
    expect(screen.getByText(/at least 6 characters/i)).toBeDefined()
    expect(mockUpdatePassword).not.toHaveBeenCalled()
  })

  it('rejects when password and confirm differ', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: 'longenough' } })
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: 'differentval' } })
    fireEvent.click(screen.getByRole('button', { name: /Update password/ }))
    expect(screen.getByText(/Passwords don't match/i)).toBeDefined()
    expect(mockUpdatePassword).not.toHaveBeenCalled()
  })

  it('calls updatePassword + navigates to /app on success', async () => {
    mockUpdatePassword.mockResolvedValueOnce()
    renderPage()
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: 'longenough' } })
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: 'longenough' } })
    fireEvent.click(screen.getByRole('button', { name: /Update password/ }))
    await waitFor(() => expect(mockUpdatePassword).toHaveBeenCalledWith('longenough'))
    // Success view shows
    expect(screen.getByText('Password updated')).toBeDefined()
    // Navigation is on a 1.2s setTimeout — wait for it (real timers).
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/app'), { timeout: 2000 })
  })

  it('routes Supabase errors through friendlyError', async () => {
    mockUpdatePassword.mockRejectedValueOnce(new Error('Token has expired'))
    renderPage()
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: 'longenough' } })
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: 'longenough' } })
    fireEvent.click(screen.getByRole('button', { name: /Update password/ }))
    await waitFor(() => expect(screen.getByText(/link has expired/i)).toBeDefined())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('strips the recovery hash from the URL on mount', () => {
    // Supabase's email link arrives with #access_token=…&type=recovery in
    // the hash. Once supabase-js parses it, the page replaces the URL so
    // the token doesn't sit in the address bar / leak via copy-paste.
    window.history.pushState(null, '', '/reset-password#access_token=fake')
    expect(window.location.hash).toBe('#access_token=fake')
    renderPage()
    expect(window.location.hash).toBe('')
  })
})
