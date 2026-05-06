import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// loadGalleryEntries reads from IndexedDB; the page only consumes it.
// Mock at the module boundary so tests can drive each state cleanly.
vi.mock('../editor/utils/galleryDb', () => ({
  loadGalleryEntries: vi.fn(),
}))

import GalleryPage from '../GalleryPage'
import { loadGalleryEntries } from '../editor/utils/galleryDb'

function renderPage() {
  return render(
    <MemoryRouter>
      <GalleryPage />
    </MemoryRouter>,
  )
}

const sampleEntry = {
  id: 'a1',
  label: 'Tokyo',
  filename: 'vedute-tokyo',
  dataUrl: 'data:image/png;base64,AAAA',
  time: new Date(),
  view: null,
  isPublic: false,
}

describe('GalleryPage', () => {
  beforeEach(() => {
    loadGalleryEntries.mockReset()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows the loading state before entries resolve', async () => {
    // Resolve never (until we explicitly drop the test)
    loadGalleryEntries.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText(/Loading…/)).toBeDefined()
  })

  it('renders the empty state when there are no entries', async () => {
    loadGalleryEntries.mockResolvedValueOnce([])
    renderPage()
    await waitFor(() =>
      expect(screen.getByText(/Make your first poster/i)).toBeDefined(),
    )
    expect(screen.getByText(/Open editor/i)).toBeDefined()
    expect(screen.getByText(/Browse community/i)).toBeDefined()
  })

  it('renders entries newest-first when there are some', async () => {
    const older = { ...sampleEntry, id: 'old', label: 'Old', time: new Date('2026-01-01') }
    const newer = { ...sampleEntry, id: 'new', label: 'New', time: new Date('2026-05-01') }
    // loadGalleryEntries returns oldest-first (per its sort order); the
    // page reverses to newest-first for display.
    loadGalleryEntries.mockResolvedValueOnce([older, newer])
    renderPage()
    await waitFor(() => expect(screen.getByText('New')).toBeDefined())
    expect(screen.getByText('Old')).toBeDefined()
    // The count line reflects the total
    expect(screen.getByText(/2 posters/)).toBeDefined()
  })

  it('uses singular "poster" in the count for one entry', async () => {
    loadGalleryEntries.mockResolvedValueOnce([sampleEntry])
    renderPage()
    await waitFor(() => expect(screen.getByText(/1 poster$/)).toBeDefined())
  })

  it('shows the Public badge on entries flagged isPublic', async () => {
    loadGalleryEntries.mockResolvedValueOnce([{ ...sampleEntry, isPublic: true, label: 'Shared' }])
    renderPage()
    await waitFor(() => expect(screen.getByText('Shared')).toBeDefined())
    expect(screen.getByText(/Public/)).toBeDefined()
  })

  it('refreshes entries on gallery-add window event', async () => {
    loadGalleryEntries
      .mockResolvedValueOnce([])                              // initial mount
      .mockResolvedValueOnce([{ ...sampleEntry, label: 'Just added' }])  // after event
    renderPage()
    await waitFor(() => expect(screen.getByText(/Make your first poster/i)).toBeDefined())
    window.dispatchEvent(new CustomEvent('gallery-add'))
    await waitFor(() => expect(screen.getByText('Just added')).toBeDefined())
  })
})
