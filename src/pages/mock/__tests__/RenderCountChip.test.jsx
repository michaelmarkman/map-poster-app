import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
    <MemoryRouter>
      <Provider store={store}>
        <RenderCountChip />
      </Provider>
    </MemoryRouter>,
  )
}

// Phase 20 — paywall disabled. Free tier has Infinity rendersPerMonth,
// so the chip's `if (!Number.isFinite(monthly)) return null` kicks in
// and the chip hides for everyone. The component still works as
// designed when a finite limit is reintroduced.

describe('RenderCountChip', () => {
  beforeEach(() => {
    localStorage.clear()
    setActiveProfile(null)
  })

  it('hides for free-tier users (paywall disabled)', () => {
    const { container } = renderWith()
    expect(container.firstChild).toBe(null)
  })

  it('hides regardless of how many renders have been consumed', () => {
    const { container } = renderWith({ renderCount: 9999 })
    expect(container.firstChild).toBe(null)
  })

  it('hides for BYOK users', () => {
    const { container } = renderWith({ aiKey: 'sk-real-key' })
    expect(container.firstChild).toBe(null)
  })

  it('hides for Pro tier (unlimited)', () => {
    const { container } = renderWith({ profile: { tier: 'pro' } })
    expect(container.firstChild).toBe(null)
  })

  it('still hides after a gallery-add event fires (no finite cap)', () => {
    const { container } = renderWith({ renderCount: 0 })
    expect(container.firstChild).toBe(null)
    act(() => {
      incrementRenderCount(2)
      window.dispatchEvent(new CustomEvent('gallery-add', { detail: {} }))
    })
    expect(container.firstChild).toBe(null)
  })
})
