import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { aspectRatioAtom, fillModeAtom } from '../../editor/atoms/ui'
import FrameOverlay from '../components/FrameOverlay'

function renderWithStore({ aspectRatio = 1.333, fillMode = false } = {}) {
  const store = createStore()
  store.set(aspectRatioAtom, aspectRatio)
  store.set(fillModeAtom, fillMode)
  return render(
    <Provider store={store}>
      <FrameOverlay />
    </Provider>,
  )
}

describe('FrameOverlay', () => {
  it('renders the frame + border + blur in normal mode', () => {
    const { container } = renderWithStore({ aspectRatio: 1.5, fillMode: false })
    expect(container.querySelector('.mock-frame-overlay')).toBeDefined()
    expect(container.querySelector('.mock-frame-blur')).toBeDefined()
    expect(container.querySelector('.mock-frame-border')).toBeDefined()
  })

  it('writes the aspect ratio to a CSS custom property', () => {
    const { container } = renderWithStore({ aspectRatio: 1.5 })
    const overlay = container.querySelector('.mock-frame-overlay')
    expect(overlay.style.getPropertyValue('--frame-ratio')).toBe('1.5')
  })

  it('renders nothing when fillMode is on', () => {
    // fillMode means "no aspect, fill the viewport" — the frame overlay
    // would be a solid border across the whole canvas, which is wrong.
    const { container } = renderWithStore({ fillMode: true })
    expect(container.querySelector('.mock-frame-overlay')).toBe(null)
    expect(container.firstChild).toBe(null)
  })

  it('reflects aspect-ratio updates in the CSS variable', () => {
    const store = createStore()
    store.set(aspectRatioAtom, 1.0)
    store.set(fillModeAtom, false)
    const { container, rerender } = render(
      <Provider store={store}>
        <FrameOverlay />
      </Provider>,
    )
    expect(
      container.querySelector('.mock-frame-overlay').style.getPropertyValue('--frame-ratio'),
    ).toBe('1')
    store.set(aspectRatioAtom, 0.667)
    rerender(
      <Provider store={store}>
        <FrameOverlay />
      </Provider>,
    )
    expect(
      container.querySelector('.mock-frame-overlay').style.getPropertyValue('--frame-ratio'),
    ).toBe('0.667')
  })
})
