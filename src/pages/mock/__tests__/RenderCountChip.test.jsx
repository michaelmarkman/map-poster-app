import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import RenderCountChip from '../components/RenderCountChip'
import { aiApiKeyAtom } from '../../editor/atoms/sidebar'
import { setActiveProfile } from '../../../lib/entitlements'
import { resetRenderCount, incrementRenderCount } from '../../../lib/renderCount'

function renderWith({ aiKey = '', renderCount = 0, profile = null } = {}) {
  resetRenderCount()
  if (renderCount > 0) incrementRenderCount(renderCount)
  setActiveProfile(profile)
  const store = createStore()
  store.set(aiApiKeyAtom, aiKey)
  return render(
    <Provider store={store}>
      <RenderCountChip />
    </Provider>,
  )
}

describe('RenderCountChip', () => {
  beforeEach(() => {
    localStorage.clear()
    setActiveProfile(null)
  })

  it('renders 5/5 for a fresh free-tier user', () => {
    renderWith()
    expect(screen.getByText('5/5')).toBeDefined()
  })

  it('decrements as renders consume', () => {
    renderWith({ renderCount: 2 })
    expect(screen.getByText('3/5')).toBeDefined()
  })

  it('shows 0/5 when at the limit', () => {
    renderWith({ renderCount: 5 })
    expect(screen.getByText('0/5')).toBeDefined()
  })

  it('hides for BYOK users', () => {
    const { container } = renderWith({ aiKey: 'sk-real-key' })
    expect(container.firstChild).toBe(null)
  })

  it('hides for Pro tier (unlimited)', () => {
    const { container } = renderWith({ profile: { tier: 'pro' } })
    expect(container.firstChild).toBe(null)
  })

  it('refreshes when a gallery-add event fires', () => {
    renderWith({ renderCount: 0 })
    expect(screen.getByText('5/5')).toBeDefined()
    act(() => {
      incrementRenderCount(2)
      window.dispatchEvent(new CustomEvent('gallery-add', { detail: {} }))
    })
    expect(screen.getByText('3/5')).toBeDefined()
  })

  it('marks the chip as empty when count hits the cap', () => {
    renderWith({ renderCount: 5 })
    const chip = screen.getByText('0/5')
    expect(chip.className).toMatch(/is-empty/)
  })
})
