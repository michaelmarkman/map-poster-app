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

  it('renders the Capture + Render split pill', () => {
    renderWithStore()
    expect(screen.getByRole('button', { name: /Capture/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /Render/ })).toBeDefined()
  })

  it('clicking Render flips modals.aiRender to true', () => {
    const { store } = renderWithStore()
    fireEvent.click(screen.getByRole('button', { name: /Render/ }))
    expect(store.get(modalsAtom).aiRender).toBe(true)
  })

  it('clicking Capture dispatches the quick-download window event', () => {
    const events = []
    const handler = (e) => events.push(e.type)
    window.addEventListener('quick-download', handler)
    try {
      renderWithStore()
      fireEvent.click(screen.getByRole('button', { name: /Capture/ }))
      expect(events).toEqual(['quick-download'])
    } finally {
      window.removeEventListener('quick-download', handler)
    }
  })
})
