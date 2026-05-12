import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { modalsAtom } from '../../editor/atoms/modals'
import { galleryEntriesAtom } from '../../editor/atoms/gallery'

// RenderCountChip pulls auth/profile context; stub for layout tests.
vi.mock('../components/RenderCountChip', () => ({
  default: () => null,
}))

import ClusterTopRight from '../components/ClusterTopRight'

function renderWith({ galleryCount = 0 } = {}) {
  const store = createStore()
  // galleryCountAtom is a read-only derived atom; seed entries instead.
  store.set(
    galleryEntriesAtom,
    Array.from({ length: galleryCount }, (_, i) => ({ id: `g${i}` })),
  )
  return { store, ...render(
    <MemoryRouter>
      <Provider store={store}>
        <ClusterTopRight />
      </Provider>
    </MemoryRouter>,
  ) }
}

describe('ClusterTopRight (Phase 7 — Gallery-only)', () => {
  beforeEach(() => {
    if (!localStorage.getItem('vedute_render_count')) {
      localStorage.setItem('vedute_render_count', '{"month":"2099-12","count":0}')
    }
  })

  it('renders a Gallery pill with the count from galleryCountAtom', () => {
    renderWith({ galleryCount: 12 })
    expect(screen.getByText('Gallery')).toBeDefined()
    expect(screen.getByText('12')).toBeDefined()
  })

  it('Gallery pill click opens the gallery modal', () => {
    const { store } = renderWith({ galleryCount: 3 })
    fireEvent.click(screen.getByRole('button', { name: /Gallery/ }))
    expect(store.get(modalsAtom).gallery).toBe(true)
  })

  it('renders no scrub pills (they moved to BR in Phase 7)', () => {
    const { container } = renderWith()
    expect(container.querySelectorAll('.mock-pill.is-drag').length).toBe(0)
  })
})
