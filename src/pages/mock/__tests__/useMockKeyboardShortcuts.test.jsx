import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import useMockKeyboardShortcuts from '../hooks/useMockKeyboardShortcuts'
import { fillModeAtom } from '../../editor/atoms/ui'
import { modalsAtom } from '../../editor/atoms/modals'

function withProvider(store) {
  return function Wrapper({ children }) {
    return <Provider store={store}>{children}</Provider>
  }
}

function dispatch(opts) {
  // jsdom KeyboardEvent doesn't propagate target via constructor; assign it.
  const ev = new KeyboardEvent('keydown', opts)
  Object.defineProperty(ev, 'target', { value: document.body })
  window.dispatchEvent(ev)
}

describe('useMockKeyboardShortcuts', () => {
  it('V dispatches save-view', () => {
    const store = createStore()
    renderHook(() => useMockKeyboardShortcuts(), { wrapper: withProvider(store) })
    const seen = []
    const handler = () => seen.push('save-view')
    window.addEventListener('save-view', handler)
    act(() => dispatch({ key: 'v' }))
    window.removeEventListener('save-view', handler)
    expect(seen).toEqual(['save-view'])
  })

  it('G toggles the gallery modal', () => {
    const store = createStore()
    store.set(modalsAtom, { gallery: false })
    renderHook(() => useMockKeyboardShortcuts(), { wrapper: withProvider(store) })
    act(() => dispatch({ key: 'g' }))
    expect(store.get(modalsAtom).gallery).toBe(true)
    act(() => dispatch({ key: 'g' }))
    expect(store.get(modalsAtom).gallery).toBe(false)
  })

  it('F toggles fill mode', () => {
    const store = createStore()
    store.set(fillModeAtom, false)
    renderHook(() => useMockKeyboardShortcuts(), { wrapper: withProvider(store) })
    act(() => dispatch({ key: 'f' }))
    expect(store.get(fillModeAtom)).toBe(true)
    act(() => dispatch({ key: 'f' }))
    expect(store.get(fillModeAtom)).toBe(false)
  })

  it('P toggles poster preview', () => {
    const store = createStore()
    store.set(modalsAtom, { posterPreview: false })
    renderHook(() => useMockKeyboardShortcuts(), { wrapper: withProvider(store) })
    act(() => dispatch({ key: 'p' }))
    expect(store.get(modalsAtom).posterPreview).toBe(true)
  })

  it('Cmd/Ctrl+S dispatches save-session (regardless of modifier)', () => {
    const store = createStore()
    renderHook(() => useMockKeyboardShortcuts(), { wrapper: withProvider(store) })
    const seen = []
    const handler = () => seen.push('save-session')
    window.addEventListener('save-session', handler)
    act(() => dispatch({ key: 's', metaKey: true }))
    act(() => dispatch({ key: 's', ctrlKey: true }))
    window.removeEventListener('save-session', handler)
    expect(seen).toEqual(['save-session', 'save-session'])
  })

  it('plain S (no modifier) does NOT save the session', () => {
    const store = createStore()
    renderHook(() => useMockKeyboardShortcuts(), { wrapper: withProvider(store) })
    const seen = []
    const handler = () => seen.push('save-session')
    window.addEventListener('save-session', handler)
    act(() => dispatch({ key: 's' }))
    window.removeEventListener('save-session', handler)
    expect(seen).toEqual([])
  })

  it('shortcuts ignore keypresses when typing in an <input>', () => {
    const store = createStore()
    store.set(fillModeAtom, false)
    renderHook(() => useMockKeyboardShortcuts(), { wrapper: withProvider(store) })
    const input = document.createElement('input')
    document.body.appendChild(input)
    const ev = new KeyboardEvent('keydown', { key: 'f' })
    Object.defineProperty(ev, 'target', { value: input })
    act(() => window.dispatchEvent(ev))
    document.body.removeChild(input)
    expect(store.get(fillModeAtom)).toBe(false)
  })

  it('shortcuts ignore keypresses when typing in a <textarea>', () => {
    const store = createStore()
    store.set(modalsAtom, { gallery: false })
    renderHook(() => useMockKeyboardShortcuts(), { wrapper: withProvider(store) })
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    const ev = new KeyboardEvent('keydown', { key: 'g' })
    Object.defineProperty(ev, 'target', { value: ta })
    act(() => window.dispatchEvent(ev))
    document.body.removeChild(ta)
    expect(store.get(modalsAtom).gallery).toBe(false)
  })

  it('Alt+key is ignored (modifier-key gate)', () => {
    const store = createStore()
    store.set(fillModeAtom, false)
    renderHook(() => useMockKeyboardShortcuts(), { wrapper: withProvider(store) })
    act(() => dispatch({ key: 'f', altKey: true }))
    expect(store.get(fillModeAtom)).toBe(false)
  })
})
