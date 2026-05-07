import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import OnboardingCard from '../components/OnboardingCard'
import { introDoneAtom, onboardedAtom } from '../../editor/atoms/sidebar'

function renderWithStore(initialOnboarded, { introDone = true } = {}) {
  const store = createStore()
  store.set(onboardedAtom, initialOnboarded)
  // Default tests to "intro done" since OnboardingCard now waits for
  // the boot intro to finish. The intro-gate behavior is covered by
  // an explicit test case below.
  store.set(introDoneAtom, introDone)
  const result = render(
    <Provider store={store}>
      <OnboardingCard />
    </Provider>,
  )
  return { ...result, store }
}

describe('OnboardingCard', () => {
  it('renders when not onboarded', () => {
    renderWithStore(false)
    expect(screen.getByText('Welcome to Vedute')).toBeDefined()
  })

  it('renders nothing when already onboarded', () => {
    const { container } = renderWithStore(true)
    expect(container.firstChild).toBe(null)
  })

  it('shows the three-hint list', () => {
    renderWithStore(false)
    expect(screen.getByText('drag')).toBeDefined()
    expect(screen.getByText('scroll')).toBeDefined()
    expect(screen.getByText('click')).toBeDefined()
  })

  it('"Got it" sets onboarded to true', () => {
    const { store } = renderWithStore(false)
    fireEvent.click(screen.getByText('Got it'))
    expect(store.get(onboardedAtom)).toBe(true)
  })

  it('× close button also sets onboarded to true', () => {
    const { store } = renderWithStore(false)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(store.get(onboardedAtom)).toBe(true)
  })

  it('renders nothing while the boot intro is still playing', () => {
    // Phase 2.7 follow-up: the card waits for introDoneAtom = true.
    const { container } = renderWithStore(false, { introDone: false })
    expect(container.firstChild).toBe(null)
  })
})
