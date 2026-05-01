import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { savedViewMarkersOnAtom } from '../../editor/atoms/sidebar'

// GuestSignInChip pulls in AuthContext + react-router; the Markers pill test
// doesn't care about it, so stub it out.
vi.mock('../components/GuestSignInChip', () => ({
  default: () => null,
}))

import ClusterTopRight from '../components/ClusterTopRight'

function withStore(initial = false) {
  const store = createStore()
  store.set(savedViewMarkersOnAtom, initial)
  return store
}

describe('Markers pill', () => {
  it('renders OFF label when atom is false', () => {
    render(
      <Provider store={withStore(false)}>
        <ClusterTopRight />
      </Provider>,
    )
    expect(screen.getByRole('button', { name: /Markers: OFF/ })).toBeInTheDocument()
  })

  it('renders ON label when atom is true', () => {
    render(
      <Provider store={withStore(true)}>
        <ClusterTopRight />
      </Provider>,
    )
    expect(screen.getByRole('button', { name: /Markers: ON/ })).toBeInTheDocument()
  })

  it('flips the atom when clicked', () => {
    const store = withStore(false)
    render(
      <Provider store={store}>
        <ClusterTopRight />
      </Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Markers: OFF/ }))
    expect(store.get(savedViewMarkersOnAtom)).toBe(true)
  })
})
