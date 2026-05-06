import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import SavedViewsPanel from '../components/SavedViewsPanel'
import {
  defaultSavedViewIdAtom,
  hoveredSavedViewIdAtom,
  savedViewsAtom,
} from '../../editor/atoms/sidebar'

const sampleViews = [
  { id: 'a', name: 'View A', thumbnail: null },
  { id: 'b', name: 'View B', thumbnail: null },
]

function renderWith({ views = sampleViews, defaultId = null } = {}) {
  const store = createStore()
  store.set(savedViewsAtom, views)
  store.set(defaultSavedViewIdAtom, defaultId)
  store.set(hoveredSavedViewIdAtom, null)
  return render(
    <Provider store={store}>
      <SavedViewsPanel />
    </Provider>,
  )
}

describe('SavedViewsPanel', () => {
  beforeEach(() => {
    // Each test gets a clean window listener slate.
    delete window.__svpDefaultListenerAttached
  })

  it('renders empty-state when there are no saved views', () => {
    renderWith({ views: [] })
    expect(screen.getByText(/No saved views yet/i)).toBeDefined()
  })

  it('renders user views by name', () => {
    renderWith()
    expect(screen.getByText('View A')).toBeDefined()
    expect(screen.getByText('View B')).toBeDefined()
  })

  it('shows the Tour section with preset views', () => {
    renderWith({ views: [] })
    expect(screen.getByText('Tour')).toBeDefined()
    // Manhattan ships in presetViews.json — no need to hardcode the
    // full list, just verify at least one preset is visible.
    expect(screen.getByText('Manhattan')).toBeDefined()
  })

  it('clicking ★ dispatches set-default-view with the id', () => {
    const events = []
    const handler = (e) => events.push(e.detail)
    window.addEventListener('set-default-view', handler)
    renderWith()
    fireEvent.click(screen.getAllByLabelText('Set as default')[0])
    window.removeEventListener('set-default-view', handler)
    expect(events).toEqual([{ id: 'a' }])
  })

  it('when a view IS the default, the toggle unsets it (id: null)', () => {
    const events = []
    const handler = (e) => events.push(e.detail)
    window.addEventListener('set-default-view', handler)
    renderWith({ defaultId: 'a' })
    // The first row's button now reads 'Unset default'.
    fireEvent.click(screen.getByLabelText('Unset default'))
    window.removeEventListener('set-default-view', handler)
    expect(events).toEqual([{ id: null }])
  })

  it('clicking up / down dispatches reorder-view in the right direction', () => {
    const events = []
    const handler = (e) => events.push(e.detail)
    window.addEventListener('reorder-view', handler)
    renderWith()
    // First row's "down" button. Up is disabled at index 0 so we
    // reach for the second row's "up".
    fireEvent.click(screen.getAllByLabelText('Move down')[0])
    fireEvent.click(screen.getAllByLabelText('Move up')[1])
    window.removeEventListener('reorder-view', handler)
    expect(events).toEqual([
      { id: 'a', direction: 'down' },
      { id: 'b', direction: 'up' },
    ])
  })

  it('clicking × dispatches delete-view with the id', () => {
    const events = []
    const handler = (e) => events.push(e.detail)
    window.addEventListener('delete-view', handler)
    renderWith()
    fireEvent.click(screen.getAllByLabelText('Delete')[0])
    window.removeEventListener('delete-view', handler)
    expect(events).toEqual(['a'])
  })

  it('Save button dispatches save-view + closes the popover', () => {
    const onClose = vi.fn()
    const events = []
    const handler = (e) => events.push(e.type)
    window.addEventListener('save-view', handler)

    const store = createStore()
    store.set(savedViewsAtom, sampleViews)
    store.set(defaultSavedViewIdAtom, null)
    render(
      <Provider store={store}>
        <SavedViewsPanel onClose={onClose} />
      </Provider>,
    )

    fireEvent.click(screen.getByText('Save current view'))
    window.removeEventListener('save-view', handler)
    expect(events).toContain('save-view')
    expect(onClose).toHaveBeenCalled()
  })

  it('rename ✎ → input → Enter dispatches rename-view', () => {
    const events = []
    const handler = (e) => events.push(e.detail)
    window.addEventListener('rename-view', handler)
    renderWith()

    fireEvent.click(screen.getAllByLabelText('Rename')[0])
    const input = screen.getByDisplayValue('View A')
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    window.removeEventListener('rename-view', handler)
    expect(events).toEqual([{ id: 'a', name: 'Renamed' }])
  })

  it('the set-default-view listener cleans up on unmount', () => {
    const before = window.__svpListenerCount || 0
    const { unmount } = renderWith()
    unmount()
    // Sanity: re-mount + unmount cycle. If cleanup was missing, the
    // listener count would diverge each time. The exact count is
    // implementation-dependent — what matters is no leak.
    const { unmount: unmount2 } = renderWith()
    unmount2()
    expect(window.__svpListenerCount || 0).toBe(before)
  })
})
