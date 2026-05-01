import { describe, it, expect } from 'vitest'
import { createStore } from 'jotai'
import { savedViewMarkersOnAtom } from '../atoms/sidebar'

describe('savedViewMarkersOnAtom', () => {
  it('defaults to false', () => {
    const store = createStore()
    expect(store.get(savedViewMarkersOnAtom)).toBe(false)
  })

  it('round-trips through set/get', () => {
    const store = createStore()
    store.set(savedViewMarkersOnAtom, true)
    expect(store.get(savedViewMarkersOnAtom)).toBe(true)
    store.set(savedViewMarkersOnAtom, false)
    expect(store.get(savedViewMarkersOnAtom)).toBe(false)
  })
})
