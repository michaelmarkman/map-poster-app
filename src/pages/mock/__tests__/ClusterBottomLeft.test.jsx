import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import ClusterBottomLeft from '../components/ClusterBottomLeft'
import { aspectRatioAtom, fillModeAtom } from '../../editor/atoms/ui'
import { modalsAtom } from '../../editor/atoms/modals'

function renderWith({ aspectRatio = 1.333, fillMode = false } = {}) {
  const store = createStore()
  store.set(aspectRatioAtom, aspectRatio)
  store.set(fillModeAtom, fillMode)
  store.set(modalsAtom, { posterPreview: false })
  const result = render(
    <Provider store={store}>
      <ClusterBottomLeft />
    </Provider>,
  )
  return { store, ...result }
}

// HoverPopoverPill closes its popover until the user hovers the trigger
// (or clicks on coarse-pointer devices). Open it explicitly so the
// inner buttons / inputs are queryable.
function openAspectPopover(container) {
  const wrap = container.querySelector('.mock-hover-pill-wrap')
  fireEvent.pointerEnter(wrap)
}

describe('ClusterBottomLeft', () => {
  it('shows the active ratio label on the trigger pill', () => {
    renderWith({ aspectRatio: 16 / 9 })
    // 16:9 renders as "Wide" — descriptive name per the prototype
    // (was "16 × 9" until the iter-5 prototype audit).
    expect(screen.getAllByText('Wide').length).toBeGreaterThan(0)
  })

  it('shows "Fill" on the trigger when in fill mode', () => {
    renderWith({ fillMode: true })
    expect(screen.getAllByText('Fill').length).toBeGreaterThan(0)
  })

  it('clicking a portrait preset sets the atom + clears fill mode', () => {
    const { store, container } = renderWith({ fillMode: true })
    openAspectPopover(container)
    // 4:5 = 16 × 20 in the new mnemonic.
    fireEvent.click(screen.getByText('16 × 20'))
    expect(store.get(aspectRatioAtom)).toBeCloseTo(0.8, 3)
    expect(store.get(fillModeAtom)).toBe(false)
  })

  it('clicking the Fill row enables fill mode', () => {
    const { store, container } = renderWith({ fillMode: false })
    openAspectPopover(container)
    // Phase 16 — the Fill row is now a .mock-menu-aspect-item inside
    // .mock-menu-aspect. The "Fill" text appears once as the row's
    // name slot (since the pill is NOT in fill mode initially, the
    // trigger pill shows the active ratio's name, not "Fill").
    const fillEls = screen.getAllByText('Fill')
    const popoverFill = fillEls.find((n) =>
      n.closest('.mock-menu-aspect-item'),
    )
    fireEvent.click(popoverFill)
    expect(store.get(fillModeAtom)).toBe(true)
  })

  it('typing a custom ratio + Set applies it', () => {
    const { store, container } = renderWith()
    openAspectPopover(container)
    const w = screen.getByLabelText('Custom width')
    const h = screen.getByLabelText('Custom height')
    fireEvent.change(w, { target: { value: '21' } })
    fireEvent.change(h, { target: { value: '9' } })
    fireEvent.click(screen.getByText('Set'))
    expect(store.get(aspectRatioAtom)).toBeCloseTo(21 / 9, 3)
    expect(store.get(fillModeAtom)).toBe(false)
  })

  it('the Set button is disabled until BOTH inputs have values', () => {
    const { container } = renderWith()
    openAspectPopover(container)
    const setBtn = screen.getByText('Set')
    expect(setBtn.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Custom width'), { target: { value: '4' } })
    expect(setBtn.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Custom height'), { target: { value: '3' } })
    expect(setBtn.disabled).toBe(false)
  })

  it('zero / negative custom ratios are rejected', () => {
    const { store, container } = renderWith({ aspectRatio: 1.333 })
    openAspectPopover(container)
    fireEvent.change(screen.getByLabelText('Custom width'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Custom height'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('Set'))
    expect(store.get(aspectRatioAtom)).toBe(1.333)
  })

  it('the preview pill toggles modalsAtom.posterPreview', () => {
    const { store } = renderWith({ fillMode: false })
    fireEvent.click(screen.getByLabelText('Toggle poster preview'))
    expect(store.get(modalsAtom).posterPreview).toBe(true)
    fireEvent.click(screen.getByLabelText('Toggle poster preview'))
    expect(store.get(modalsAtom).posterPreview).toBe(false)
  })

  it('the preview pill is hidden in fill mode', () => {
    renderWith({ fillMode: true })
    expect(screen.queryByLabelText('Toggle poster preview')).toBe(null)
  })
})
