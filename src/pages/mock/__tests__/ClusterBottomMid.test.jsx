import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { modalsAtom } from '../../editor/atoms/modals'
import ClusterBottomMid from '../components/ClusterBottomMid'

function renderWithStore() {
  const store = createStore()
  store.set(modalsAtom, {})
  return { store, ...render(
    <Provider store={store}>
      <ClusterBottomMid />
    </Provider>,
  ) }
}

describe('ClusterBottomMid', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a single Capture button (no separate Render button)', () => {
    renderWithStore()
    expect(screen.getByRole('button', { name: /Capture/ })).toBeDefined()
    expect(screen.queryByRole('button', { name: /^Render$/ })).toBe(null)
  })

  it('clicking Capture flips modals.aiRender to true (opens the Render sheet)', () => {
    const { store } = renderWithStore()
    fireEvent.click(screen.getByRole('button', { name: /Capture/ }))
    expect(store.get(modalsAtom).aiRender).toBe(true)
  })

  it('does NOT dispatch quick-download — that path moved to the E keyboard shortcut', () => {
    const events = []
    const handler = (e) => events.push(e.type)
    window.addEventListener('quick-download', handler)
    try {
      renderWithStore()
      fireEvent.click(screen.getByRole('button', { name: /Capture/ }))
      expect(events).toEqual([])
    } finally {
      window.removeEventListener('quick-download', handler)
    }
  })
})
