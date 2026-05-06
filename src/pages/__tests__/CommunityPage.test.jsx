import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../editor/utils/galleryDb', () => ({
  loadGalleryEntries: vi.fn(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import CommunityPage from '../CommunityPage'
import { loadGalleryEntries } from '../editor/utils/galleryDb'

function renderPage() {
  return render(
    <MemoryRouter>
      <CommunityPage />
    </MemoryRouter>,
  )
}

const baseEntry = {
  id: 'e1',
  label: 'Manhattan',
  filename: 'vedute-manhattan',
  dataUrl: 'data:image/png;base64,AAAA',
  time: new Date('2026-04-01'),
  view: null,
  isPublic: true,
  location: '40.7128°N, 74.006°W',
}

describe('CommunityPage', () => {
  beforeEach(() => {
    loadGalleryEntries.mockReset()
    mockNavigate.mockReset()
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows the loading state before entries resolve', () => {
    loadGalleryEntries.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText(/Loading…/)).toBeDefined()
  })

  it('renders the empty state when no entries are public', async () => {
    loadGalleryEntries.mockResolvedValueOnce([
      { ...baseEntry, isPublic: false },
    ])
    renderPage()
    await waitFor(() =>
      expect(screen.getByText(/Nothing public yet/)).toBeDefined(),
    )
    expect(screen.getByText(/Open the editor/)).toBeDefined()
  })

  it('filters out non-public entries', async () => {
    loadGalleryEntries.mockResolvedValueOnce([
      { ...baseEntry, id: 'pub', label: 'Public', isPublic: true },
      { ...baseEntry, id: 'priv', label: 'Private', isPublic: false },
    ])
    renderPage()
    await waitFor(() => expect(screen.getByText('Public')).toBeDefined())
    expect(screen.queryByText('Private')).toBe(null)
  })

  it('renders public entries newest-first', async () => {
    loadGalleryEntries.mockResolvedValueOnce([
      { ...baseEntry, id: 'old', label: 'Old', time: new Date('2026-01-01'), isPublic: true },
      { ...baseEntry, id: 'new', label: 'New', time: new Date('2026-05-01'), isPublic: true },
    ])
    renderPage()
    await waitFor(() => expect(screen.getByText('New')).toBeDefined())
    // Both visible — order is reversed in JSX
    const buttons = screen.getAllByRole('button')
    // Card buttons render label inside; first visible card should be 'New'
    expect(buttons[0].textContent).toContain('New')
  })

  it('clicking a card with a view stashes pending-restore + navigates', async () => {
    const view = { camera: { px: 1, py: 2, pz: 3 } }
    loadGalleryEntries.mockResolvedValueOnce([
      { ...baseEntry, view },
    ])
    renderPage()
    await waitFor(() => expect(screen.getByText('Manhattan')).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: /Manhattan/ }))
    const stashed = sessionStorage.getItem('vedute_pending_restore')
    expect(JSON.parse(stashed)).toEqual(view)
    expect(mockNavigate).toHaveBeenCalledWith('/app')
  })

  it('clicking a card with no view navigates without stashing', async () => {
    loadGalleryEntries.mockResolvedValueOnce([
      { ...baseEntry, view: null },
    ])
    renderPage()
    await waitFor(() => expect(screen.getByText('Manhattan')).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: /Manhattan/ }))
    expect(sessionStorage.getItem('vedute_pending_restore')).toBe(null)
    expect(mockNavigate).toHaveBeenCalledWith('/app')
  })
})
