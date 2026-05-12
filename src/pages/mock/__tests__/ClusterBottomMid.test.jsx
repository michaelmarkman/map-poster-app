import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import ClusterBottomMid from '../components/ClusterBottomMid'

// Phase 7 — ClusterBottomMid is now intentionally empty. Capture moved
// to BR per the MoMA prototype's geography. The Capture button +
// click-opens-render-sheet behaviour is tested under
// ClusterBottomRight.test.jsx instead.
function renderWithStore() {
  const store = createStore()
  return { store, ...render(
    <Provider store={store}>
      <ClusterBottomMid />
    </Provider>,
  ) }
}

describe('ClusterBottomMid (Phase 7 — empty)', () => {
  it('renders an empty cluster element', () => {
    const { container } = renderWithStore()
    const cluster = container.querySelector('.mock-cluster--bottom-mid')
    expect(cluster).not.toBe(null)
    expect(cluster.children.length).toBe(0)
  })
})
