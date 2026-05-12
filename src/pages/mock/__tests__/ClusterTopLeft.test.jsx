import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'

// AccountChip pulls AuthContext + useNavigate. None of that matters for
// these layout-focused tests; stub it so we don't need to mount the
// full provider chain.
vi.mock('../components/AccountChip', () => ({
  default: () => null,
}))

// Mock the geocode module so we can control responses without hitting
// /api/places or Nominatim. The cluster now drives an autocomplete
// dropdown via searchPlaces + resolvePlace; we stub both.
vi.mock('../../../lib/geocode', () => ({
  searchPlaces: vi.fn(),
  resolvePlace: vi.fn(),
  newSessionToken: vi.fn(() => 'sess-test'),
}))
import { searchPlaces, resolvePlace } from '../../../lib/geocode'

import ClusterTopLeft from '../components/ClusterTopLeft'
import { savedViewsAtom } from '../../editor/atoms/sidebar'
import {
  latitudeAtom,
  longitudeAtom,
  timeOfDayAtom,
} from '../../editor/atoms/scene'
import { textFieldsAtom } from '../../editor/atoms/ui'

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

function openSearchPopover() {
  fireEvent.click(screen.getByLabelText(/Search location/))
}

async function typeQuery(input, value) {
  fireEvent.change(input, { target: { value } })
  // searchPlaces fires after the 200ms keystroke debounce.
  await waitFor(() => expect(searchPlaces).toHaveBeenCalled())
}

describe('ClusterTopLeft', () => {
  beforeEach(() => {
    searchPlaces.mockReset()
    resolvePlace.mockReset()
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
    // Phase 1 — Pill is two-slot now: "Views" in .mock-pill-label and
    // the count in .mock-pill-value (no "·" separator).
    expect(screen.getByText('Views')).toBeDefined()
    expect(screen.getByText('2')).toBeDefined()
  })

  it('renders "Views 0" when there are no saved views (prototype always shows count)', () => {
    renderWith({ savedViews: [] })
    expect(screen.getByText('Views')).toBeDefined()
    // The prototype's data-views-count is always rendered — "0" is
    // legitimate copy, not a UX edge case to hide.
    expect(screen.getByText('0')).toBeDefined()
  })

  it('typing fires searchPlaces with sessionToken + bias from current camera', async () => {
    searchPlaces.mockResolvedValue([])
    renderWith()
    openSearchPopover()
    const input = screen.getByPlaceholderText('Search a place…')
    await typeQuery(input, 'tokyo')
    const [q, opts] = searchPlaces.mock.calls.at(-1)
    expect(q).toBe('tokyo')
    expect(opts.sessionToken).toBe('sess-test')
    expect(opts.bias).toMatchObject({ lat: 40.73, lng: -73.98 })
  })

  it('renders predictions in a dropdown listbox', async () => {
    searchPlaces.mockResolvedValue([
      { description: 'Tokyo, Japan', mainText: 'Tokyo', secondaryText: 'Japan', placeId: 'p1' },
      { description: 'Tokyo Tower, Tokyo, Japan', mainText: 'Tokyo Tower', secondaryText: 'Tokyo, Japan', placeId: 'p2' },
    ])
    renderWith()
    openSearchPopover()
    const input = screen.getByPlaceholderText('Search a place…')
    await typeQuery(input, 'tokyo')
    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2)
    })
    expect(screen.getByText('Tokyo')).toBeDefined()
    expect(screen.getByText('Tokyo Tower')).toBeDefined()
  })

  it('Enter on a Google prediction resolves it then dispatches fly-to', async () => {
    searchPlaces.mockResolvedValue([
      { description: 'Paris, France', mainText: 'Paris', secondaryText: 'France', placeId: 'p1' },
    ])
    resolvePlace.mockResolvedValue({
      lat: 48.8566,
      lng: 2.3522,
      displayName: 'Paris',
      formattedAddress: 'Paris, France',
    })
    const flies = []
    const onFly = (e) => flies.push(e.detail)
    window.addEventListener('fly-to', onFly)

    renderWith()
    openSearchPopover()
    const input = screen.getByPlaceholderText('Search a place…')
    await typeQuery(input, 'paris')
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0))
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    await waitFor(() => expect(flies.length).toBeGreaterThan(0))
    window.removeEventListener('fly-to', onFly)
    expect(resolvePlace).toHaveBeenCalledWith('p1', { sessionToken: 'sess-test' })
    expect(flies[0].lat).toBeCloseTo(48.8566, 3)
    expect(flies[0].lng).toBeCloseTo(2.3522, 3)
  })

  it('Nominatim fallback predictions skip resolvePlace (use inline lat/lng)', async () => {
    // searchPlaces' fallback shape carries lat/lng inline + null placeId.
    searchPlaces.mockResolvedValue([
      { description: 'Rio, Brazil', mainText: 'Rio', secondaryText: 'Brazil', placeId: null, lat: -22.9, lng: -43.2 },
    ])
    const flies = []
    window.addEventListener('fly-to', (e) => flies.push(e.detail))

    renderWith()
    openSearchPopover()
    const input = screen.getByPlaceholderText('Search a place…')
    await typeQuery(input, 'rio')
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0))
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    await waitFor(() => expect(flies.length).toBeGreaterThan(0))
    expect(resolvePlace).not.toHaveBeenCalled()
    expect(flies[0].lat).toBeCloseTo(-22.9, 1)
  })

  it('Enter on a resolved place writes title + coords into textFieldsAtom', async () => {
    searchPlaces.mockResolvedValue([
      { description: 'Rio de Janeiro, Brazil', mainText: 'Rio de Janeiro', secondaryText: 'Brazil', placeId: 'p1' },
    ])
    resolvePlace.mockResolvedValue({
      lat: -22.9068,
      lng: -43.1729,
      displayName: 'Rio de Janeiro',
      formattedAddress: 'Rio de Janeiro, Brazil',
    })
    const { store } = renderWith()
    openSearchPopover()
    const input = screen.getByPlaceholderText('Search a place…')
    await typeQuery(input, 'rio')
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0))
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

  it('ArrowDown / ArrowUp move highlight; Enter commits the highlighted prediction', async () => {
    searchPlaces.mockResolvedValue([
      { description: 'A', mainText: 'A', secondaryText: '', placeId: 'pA' },
      { description: 'B', mainText: 'B', secondaryText: '', placeId: 'pB' },
      { description: 'C', mainText: 'C', secondaryText: '', placeId: 'pC' },
    ])
    resolvePlace.mockResolvedValue({ lat: 1, lng: 2, displayName: 'B' })

    renderWith()
    openSearchPopover()
    const input = screen.getByPlaceholderText('Search a place…')
    await typeQuery(input, 'q')
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(3))

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    await waitFor(() => expect(resolvePlace).toHaveBeenCalled())
    expect(resolvePlace.mock.calls[0][0]).toBe('pB')
  })

  it('Escape closes the popover without firing fly-to', async () => {
    searchPlaces.mockResolvedValue([])
    const flies = []
    window.addEventListener('fly-to', (e) => flies.push(e))
    renderWith()
    openSearchPopover()
    const input = screen.getByPlaceholderText('Search a place…')
    fireEvent.change(input, { target: { value: 'foo' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(flies).toHaveLength(0)
  })

  it('empty / whitespace input never calls searchPlaces', async () => {
    renderWith()
    openSearchPopover()
    const input = screen.getByPlaceholderText('Search a place…')
    fireEvent.change(input, { target: { value: '   ' } })
    // Wait long enough for the debounce.
    await new Promise((r) => setTimeout(r, 250))
    expect(searchPlaces).not.toHaveBeenCalled()
  })
})
