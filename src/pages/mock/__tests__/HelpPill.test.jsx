import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import HelpPill from '../components/HelpPill'
import { onboardedAtom } from '../../editor/atoms/sidebar'

function renderWith({ onboarded = true } = {}) {
  const store = createStore()
  store.set(onboardedAtom, onboarded)
  const result = render(
    <Provider store={store}>
      <HelpPill />
    </Provider>,
  )
  return { ...result, store }
}

describe('HelpPill', () => {
  it('renders the ? trigger', () => {
    renderWith()
    expect(screen.getByLabelText('Keyboard shortcuts and help')).toBeDefined()
  })

  it('opens a popover with the shortcut list when clicked', () => {
    renderWith()
    fireEvent.click(screen.getByLabelText('Keyboard shortcuts and help'))
    // A few representative shortcuts from the canonical list.
    expect(screen.getByText('Save current view')).toBeDefined()
    expect(screen.getByText('Open gallery')).toBeDefined()
    expect(screen.getByText('Toggle fill mode')).toBeDefined()
    expect(screen.getByText('Toggle poster preview')).toBeDefined()
  })

  it('"Show welcome card again" flips onboarded back to false', () => {
    const { store } = renderWith({ onboarded: true })
    fireEvent.click(screen.getByLabelText('Keyboard shortcuts and help'))
    fireEvent.click(screen.getByText('Show welcome card again'))
    expect(store.get(onboardedAtom)).toBe(false)
  })
})
