import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// jsdom doesn't ship IntersectionObserver — the LandingPage's
// FadeInCard uses it to fade feature cards in on scroll. Stub it
// with a no-op so renders don't throw.
class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.IntersectionObserver = global.IntersectionObserver || IO

let mockUser = null
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}))

import LandingPage from '../LandingPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  )
}

describe('LandingPage', () => {
  beforeEach(() => {
    mockUser = null
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Vedute hero (the very first thing visitors see)', () => {
    renderPage()
    // Hero h1 reads 'Vedute' — Phase 1.1 fix replaced the original
    // 'MapPoster' brand. This is the regression guard for that fix.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Vedute')
  })

  it('renders all four feature cards by name', () => {
    renderPage()
    // 3D Globe View / Art Styles / Time of Day / Export & Print —
    // 'Time Machine' was renamed in the rebrand because the sidebar
    // editor's Time Machine modal is gone. Test locks the rename.
    expect(screen.getByText('3D Globe View')).toBeDefined()
    expect(screen.getByText('Art Styles')).toBeDefined()
    expect(screen.getByText('Time of Day')).toBeDefined()
    expect(screen.queryByText('Time Machine')).toBe(null)
    expect(screen.getByText('Export & Print')).toBeDefined()
  })

  it('CTAs link to /app + /community via React Router (no full reload)', () => {
    renderPage()
    const links = screen.getAllByRole('link')
    const hrefs = links.map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/app')
    expect(hrefs).toContain('/community')
    // The pre-rebrand version pointed at the legacy prototype HTML
    // pages — make sure those URLs aren't being shipped.
    expect(hrefs).not.toContain('/prototypes/poster-v3-ui.html')
    expect(hrefs).not.toContain('/prototypes/community.html')
  })

  it('primary CTA reads "Try it free" for guests', () => {
    renderPage()
    expect(screen.getByText('Try it free')).toBeDefined()
    expect(screen.queryByText('Open editor')).toBe(null)
  })

  it('primary CTA reads "Open editor" for logged-in users', () => {
    mockUser = { id: 'u1' }
    renderPage()
    expect(screen.getByText('Open editor')).toBeDefined()
    expect(screen.queryByText('Try it free')).toBe(null)
  })

  it('footer brand is Vedute', () => {
    renderPage()
    expect(screen.getByText(/Vedute — aerial city posters/)).toBeDefined()
  })
})
