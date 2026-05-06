import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'

// AccountChip pulls AuthContext + useNavigate. None of that matters for
// these layout-focused tests; stub it so we don't need to mount the
// full provider chain.
vi.mock('../components/AccountChip', () => ({
  default: () => null,
}))

import ClusterTopLeft from '../components/ClusterTopLeft'
import { savedViewsAtom } from '../../editor/atoms/sidebar'
import {
  latitudeAtom,
  longitudeAtom,
  timeOfDayAtom,
} from '../../editor/atoms/scene'
import { textFieldsAtom } from '../../editor/atoms/ui'

// Mock the geocode module so we can control responses without hitting Nominatim.
vi.mock('../../../lib/geocode', () => ({
  geocodeSearch: vi.fn(),
}))
import { geocodeSearch } from '../../../lib/geocode'

function renderWith({ savedViews = [] } = {}) {
  const store = createStore()
  store.set(savedViewsAtom, savedViews)
  store.set(latitudeAtom, 40.73)
  store.set(longitudeAtom, -73.98)
  store.set(timeOfDayAtom, 12)
  return {
    store,
    ...render(
      <Provider store={store}>
        <ClusterTopLeft />
      </Provider>,
    ),
  }
}

function openPopover(buttonLabelMatch) {
  // PopoverPill opens on click of the inner Pill button.
  const trigger = screen.getByLabelText(buttonLabelMatch)
  fireEvent.click(trigger)
}

describe('ClusterTopLeft', () => {
  beforeEach(() => {
    geocodeSearch.mockReset()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the saved-views count when there are views', () => {
    renderWith({
      savedViews: [
        { id: 'a', name: 'View A' },
        { id: 'b', name: 'View B' },
      ],
    })
    // The pill label reads `Views · 2` when there are saved views.
    expect(screen.getByText(/Views/)).toBeDefined()
    expect(screen.getByText(/·\s*2/)).toBeDefined()
  })

  it('renders just "Views" when there are no saved views (no count)', () => {
    renderWith({ savedViews: [] })
    const label = screen.getByText(/Views/)
    expect(label.textContent).toBe('Views')
  })

  it('search miss dispatches a toast event (no alert call)', async () => {
    geocodeSearch.mockResolvedValueOnce(null)
    const events = []
    const onToast = (e) => events.push(e.detail)
    window.addEventListener('toast', onToast)

    renderWith()
    openPopover(/Search location/)
    const input = screen.getByPlaceholderText('Search a place…')
    fireEvent.change(input, { target: { value: 'asdfqwerty' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    await waitFor(() => expect(events.length).toBeGreaterThan(0))
    window.removeEventListener('toast', onToast)
    expect(events[0]).toMatchObject({ type: 'error', message: 'Location not found' })
  })

  it('search hit dispatches fly-to with the resolved coords', async () => {
    geocodeSearch.mockResolvedValueOnce({
      lat: 48.8566,
      lng: 2.3522,
      displayName: 'Paris, Île-de-France, France',
    })
    const events = []
    const onFly = (e) => events.push(e.detail)
    window.addEventListener('fly-to', onFly)

    renderWith()
    openPopover(/Search location/)
    const input = screen.getByPlaceholderText('Search a place…')
    fireEvent.change(input, { target: { value: 'paris' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    await waitFor(() => expect(events.length).toBeGreaterThan(0))
    window.removeEventListener('fly-to', onFly)
    expect(events[0].lat).toBeCloseTo(48.8566, 3)
    expect(events[0].lng).toBeCloseTo(2.3522, 3)
  })

  it('search hit emits location-changed with shortName + coordStr', async () => {
    geocodeSearch.mockResolvedValueOnce({
      lat: 35.6762,
      lng: 139.6503,
      displayName: 'Tokyo, Japan',
    })
    const events = []
    const onLoc = (e) => events.push(e.detail)
    window.addEventListener('location-changed', onLoc)

    renderWith()
    openPopover(/Search location/)
    const input = screen.getByPlaceholderText('Search a place…')
    fireEvent.change(input, { target: { value: 'tokyo' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    await waitFor(() => expect(events.length).toBeGreaterThan(0))
    window.removeEventListener('location-changed', onLoc)
    const [{ shortName, coordStr, lat, lng, fullName }] = events
    expect(shortName).toBe('Tokyo')
    expect(coordStr).toMatch(/35\.6762° N, 139\.6503° E/)
    expect(lat).toBeCloseTo(35.6762, 3)
    expect(lng).toBeCloseTo(139.6503, 3)
    expect(fullName).toBe('Tokyo, Japan')
  })

  it('search hit also writes title + coords into textFieldsAtom', async () => {
    geocodeSearch.mockResolvedValueOnce({
      lat: -22.9068,
      lng: -43.1729,
      displayName: 'Rio de Janeiro, Brazil',
    })

    const { store } = renderWith()
    openPopover(/Search location/)
    const input = screen.getByPlaceholderText('Search a place…')
    fireEvent.change(input, { target: { value: 'rio' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    await waitFor(() => {
      const fields = store.get(textFieldsAtom)
      expect(fields.title).toBe('Rio de Janeiro')
    })
    const fields = store.get(textFieldsAtom)
    expect(fields.coords).toMatch(/22\.9068° S, 43\.1729° W/)
  })

  it('empty / whitespace search is a no-op (no fly-to, no toast)', async () => {
    const flies = []
    const toasts = []
    window.addEventListener('fly-to', (e) => flies.push(e))
    window.addEventListener('toast', (e) => toasts.push(e))

    renderWith()
    openPopover(/Search location/)
    const input = screen.getByPlaceholderText('Search a place…')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(geocodeSearch).not.toHaveBeenCalled()
    expect(flies).toHaveLength(0)
    expect(toasts).toHaveLength(0)
  })
})
