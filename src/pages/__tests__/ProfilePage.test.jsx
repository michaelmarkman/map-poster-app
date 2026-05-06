import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import { aiApiKeyAtom } from '../editor/atoms/sidebar'
import { setActiveProfile } from '../../lib/entitlements'
import { resetRenderCount, incrementRenderCount } from '../../lib/renderCount'

// Module-level mocks for the auth + gallery + storage layer.
const mockUpdateProfile = vi.fn()
const mockUploadAvatar = vi.fn()
let mockProfile = null
let mockAuthUser = null

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: mockProfile,
    user: mockAuthUser,
    updateProfile: mockUpdateProfile,
    uploadAvatar: mockUploadAvatar,
  }),
}))
vi.mock('../editor/utils/galleryDb', () => ({
  loadGalleryEntries: vi.fn(() => Promise.resolve([])),
}))

import ProfilePage from '../ProfilePage'

function renderPage({ aiKey = '' } = {}) {
  const store = createStore()
  store.set(aiApiKeyAtom, aiKey)
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <ProfilePage />
      </Provider>
    </MemoryRouter>,
  )
}

describe('ProfilePage', () => {
  beforeEach(() => {
    mockUpdateProfile.mockReset()
    mockUploadAvatar.mockReset()
    mockProfile = null
    mockAuthUser = { id: 'u1', email: 'a@b.com' }
    resetRenderCount()
    setActiveProfile(null)
    localStorage.clear()
  })
  afterEach(() => {
    vi.clearAllMocks()
    setActiveProfile(null)
  })

  it('shows the email in the read-only view', () => {
    renderPage()
    expect(screen.getByText('a@b.com')).toBeDefined()
  })

  it('renders Edit profile button in the read-only view', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /Edit profile/ })).toBeDefined()
  })

  it('clicking Edit reveals the form with the current display_name + bio', async () => {
    mockProfile = { display_name: 'Alice', bio: 'Lover of city posters', tier: null }
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Edit profile/ }))
    expect(screen.getByDisplayValue('Alice')).toBeDefined()
    expect(screen.getByDisplayValue('Lover of city posters')).toBeDefined()
  })

  it('rejects empty display_name on Save', async () => {
    mockProfile = { display_name: 'Alice', bio: '' }
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Edit profile/ }))
    const nameInput = screen.getByDisplayValue('Alice')
    fireEvent.change(nameInput, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
    expect(screen.getByText(/Display name is required/i)).toBeDefined()
    expect(mockUpdateProfile).not.toHaveBeenCalled()
  })

  it('rejects display_name longer than 50 chars', async () => {
    mockProfile = { display_name: 'Alice', bio: '' }
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Edit profile/ }))
    fireEvent.change(screen.getByDisplayValue('Alice'), {
      target: { value: 'x'.repeat(51) },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
    expect(screen.getByText(/keep it under 50/i)).toBeDefined()
    expect(mockUpdateProfile).not.toHaveBeenCalled()
  })

  it('rejects bio longer than 500 chars', async () => {
    mockProfile = { display_name: 'Alice', bio: '' }
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Edit profile/ }))
    const bioField = screen.getByLabelText(/Bio/)
    fireEvent.change(bioField, { target: { value: 'x'.repeat(501) } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
    expect(screen.getByText(/keep it under 500/i)).toBeDefined()
    expect(mockUpdateProfile).not.toHaveBeenCalled()
  })

  it('saves a valid edit + leaves the form', async () => {
    mockProfile = { display_name: 'Alice', bio: 'old bio' }
    mockUpdateProfile.mockResolvedValueOnce()
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Edit profile/ }))
    fireEvent.change(screen.getByDisplayValue('Alice'), { target: { value: 'Alice Cooper' } })
    fireEvent.change(screen.getByDisplayValue('old bio'), { target: { value: 'new bio' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledWith({
      display_name: 'Alice Cooper',
      bio: 'new bio',
    }))
    // Read-only view returns
    expect(screen.queryByRole('button', { name: /^Save$/ })).toBe(null)
  })

  it('shows the used / monthly meter text for free users', () => {
    incrementRenderCount(2)
    renderPage()
    // Free tier is 5/month; meter reads e.g. '2 of 5 AI renders used'
    expect(screen.getByText(/2 of 5 AI renders used/i)).toBeDefined()
  })

  it('shows "Unlimited" for Pro users', () => {
    mockProfile = { tier: 'pro' }
    setActiveProfile({ tier: 'pro' })
    renderPage()
    expect(screen.getByText(/Unlimited renders/i)).toBeDefined()
    // The 'X of 5' line should NOT appear
    expect(screen.queryByText(/of 5/)).toBe(null)
  })

  it('appends BYOK-bypass note when an aiKey is set', () => {
    renderPage({ aiKey: 'sk-real' })
    expect(screen.getByText(/BYOK bypasses this limit/)).toBeDefined()
  })

  it('avatar: rejects a non-image file with a specific message (not the generic friendlyError fallback)', () => {
    renderPage()
    // jsdom's File expects a Blob constructor input; an empty array works.
    const file = new File([''], 'evil.exe', { type: 'application/x-msdownload' })
    Object.defineProperty(file, 'size', { value: 100 })
    const input = document.querySelector('input[type=file]')
    fireEvent.change(input, { target: { files: [file] } })
    // The validation message must reach the user verbatim, not be
    // smothered into "Something went wrong".
    expect(screen.getByText(/JPG, PNG, WebP, or GIF/i)).toBeInTheDocument()
    expect(mockUploadAvatar).not.toHaveBeenCalled()
  })

  it('avatar: rejects an over-size image with a specific message', () => {
    renderPage()
    const file = new File([''], 'huge.jpg', { type: 'image/jpeg' })
    Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 }) // 10 MB
    const input = document.querySelector('input[type=file]')
    fireEvent.change(input, { target: { files: [file] } })
    expect(screen.getByText(/too large/i)).toBeInTheDocument()
    expect(screen.getByText(/max is 5 MB/i)).toBeInTheDocument()
    expect(mockUploadAvatar).not.toHaveBeenCalled()
  })

  it('avatar: a valid image hits uploadAvatar', async () => {
    mockUploadAvatar.mockResolvedValue('https://example.com/avatar.jpg')
    renderPage()
    const file = new File([''], 'me.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: 100 * 1024 })
    const input = document.querySelector('input[type=file]')
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(mockUploadAvatar).toHaveBeenCalledWith(file))
  })
})
