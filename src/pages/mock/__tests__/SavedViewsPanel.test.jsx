import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import SavedViewsPanel from '../components/SavedViewsPanel'
import {
  defaultSavedViewIdAtom,
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
  return render(
    <Provider store={store}>
      <SavedViewsPanel />
    </Provider>,
  )
}

describe('SavedViewsPanel', () => {

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

  it('does not render reorder ↑↓ buttons on this surface (Phase 21 prototype match)', () => {
    // The prototype's `.menu-view-item` recipe has only pin + delete
    // affordances. Reorder still works via the `reorder-view` window
    // event for callers that need it (e.g. a future drag-handle UI
    // or keyboard shortcut), but isn't surfaced as a button inside
    // this menu.
    renderWith()
    expect(screen.queryAllByLabelText('Move up')).toHaveLength(0)
    expect(screen.queryAllByLabelText('Move down')).toHaveLength(0)
  })

  it('clicking × dispatches delete-view with the id (after confirm)', () => {
    // Saved views can't be undone — Delete prompts a confirm. The
    // test always confirms; cancel-path is covered separately.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const events = []
    const handler = (e) => events.push(e.detail)
    window.addEventListener('delete-view', handler)
    renderWith()
    fireEvent.click(screen.getAllByLabelText('Delete')[0])
    window.removeEventListener('delete-view', handler)
    confirmSpy.mockRestore()
    expect(events).toEqual(['a'])
  })

  it('cancelling the Delete confirm does NOT dispatch delete-view', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const events = []
    const handler = (e) => events.push(e.detail)
    window.addEventListener('delete-view', handler)
    renderWith()
    fireEvent.click(screen.getAllByLabelText('Delete')[0])
    window.removeEventListener('delete-view', handler)
    confirmSpy.mockRestore()
    expect(events).toEqual([])
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

  it('does not render an inline rename ✎ on this surface (Phase 21 prototype match)', () => {
    // The prototype's `.menu-view-item` recipe doesn't expose rename
    // inline. The `rename-view` window event still works for callers
    // that bring up their own rename UI later (e.g. a context menu).
    renderWith()
    expect(screen.queryAllByLabelText('Rename')).toHaveLength(0)
  })

  it('the set-default-view listener cleans up on unmount', () => {
    // Spy on add/remove for the specific event name, then assert add
    // count == remove count after a mount/unmount cycle. (Was checking
    // window.__svpListenerCount against itself, which always passed
    // regardless of cleanup behavior — a test from before the source
    // moved away from a window-global counter.)
    let added = 0
    let removed = 0
    const realAdd = window.addEventListener
    const realRemove = window.removeEventListener
    window.addEventListener = function (type, ...rest) {
      if (type === 'set-default-view') added++
      return realAdd.call(this, type, ...rest)
    }
    window.removeEventListener = function (type, ...rest) {
      if (type === 'set-default-view') removed++
      return realRemove.call(this, type, ...rest)
    }
    try {
      const { unmount } = renderWith()
      unmount()
      const { unmount: unmount2 } = renderWith()
      unmount2()
      expect(added).toBe(removed)
      expect(added).toBeGreaterThan(0)
    } finally {
      window.addEventListener = realAdd
      window.removeEventListener = realRemove
    }
  })
})
