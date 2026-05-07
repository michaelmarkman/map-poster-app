import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { isGuest, enterGuestMode, exitGuestMode, useGuestMode } from '../guestMode'

describe('guestMode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('isGuest / enterGuestMode / exitGuestMode', () => {
    it('starts false on a clean localStorage', () => {
      expect(isGuest()).toBe(false)
    })

    it('enterGuestMode flips the flag to true', () => {
      enterGuestMode()
      expect(isGuest()).toBe(true)
      expect(localStorage.getItem('guest_mode')).toBe('true')
    })

    it('exitGuestMode flips the flag back to false', () => {
      enterGuestMode()
      exitGuestMode()
      expect(isGuest()).toBe(false)
      expect(localStorage.getItem('guest_mode')).toBe(null)
    })

    it('only "true" counts as guest — junk values resolve to false', () => {
      localStorage.setItem('guest_mode', 'yes')
      expect(isGuest()).toBe(false)
      localStorage.setItem('guest_mode', '1')
      expect(isGuest()).toBe(false)
    })

    it('survives localStorage being unavailable (private mode, etc.)', () => {
      // Nuke localStorage to simulate a browser that throws on access.
      const realStorage = window.localStorage
      Object.defineProperty(window, 'localStorage', {
        get() { throw new Error('storage disabled') },
        configurable: true,
      })
      try {
        // None of these should throw — guestMode swallows storage errors.
        expect(isGuest()).toBe(false)
        expect(() => enterGuestMode()).not.toThrow()
        expect(() => exitGuestMode()).not.toThrow()
      } finally {
        Object.defineProperty(window, 'localStorage', {
          value: realStorage,
          writable: true,
          configurable: true,
        })
      }
    })

    it('enterGuestMode dispatches the change event', () => {
      const events = []
      const handler = () => events.push('guest-mode-changed')
      window.addEventListener('guest-mode-changed', handler)
      enterGuestMode()
      window.removeEventListener('guest-mode-changed', handler)
      expect(events).toEqual(['guest-mode-changed'])
    })

    it('exitGuestMode dispatches the change event', () => {
      enterGuestMode()
      const events = []
      const handler = () => events.push('guest-mode-changed')
      window.addEventListener('guest-mode-changed', handler)
      exitGuestMode()
      window.removeEventListener('guest-mode-changed', handler)
      expect(events).toEqual(['guest-mode-changed'])
    })
  })

  describe('useGuestMode', () => {
    it('reflects the current flag on first render', () => {
      enterGuestMode()
      const { result } = renderHook(() => useGuestMode())
      expect(result.current).toBe(true)
    })

    it('updates when enterGuestMode runs after mount', () => {
      const { result } = renderHook(() => useGuestMode())
      expect(result.current).toBe(false)
      act(() => { enterGuestMode() })
      expect(result.current).toBe(true)
    })

    it('updates when exitGuestMode runs after mount', () => {
      enterGuestMode()
      const { result } = renderHook(() => useGuestMode())
      expect(result.current).toBe(true)
      act(() => { exitGuestMode() })
      expect(result.current).toBe(false)
    })

    it('updates on cross-tab storage events', () => {
      const { result } = renderHook(() => useGuestMode())
      expect(result.current).toBe(false)
      // Simulate another tab flipping the flag — localStorage 'storage'
      // events are how cross-tab sync works.
      act(() => {
        localStorage.setItem('guest_mode', 'true')
        window.dispatchEvent(new Event('storage'))
      })
      expect(result.current).toBe(true)
    })

    it('cleans up event listeners on unmount', () => {
      let added = 0
      let removed = 0
      const realAdd = window.addEventListener
      const realRemove = window.removeEventListener
      window.addEventListener = function (type, ...rest) {
        if (type === 'guest-mode-changed' || type === 'storage') added++
        return realAdd.call(this, type, ...rest)
      }
      window.removeEventListener = function (type, ...rest) {
        if (type === 'guest-mode-changed' || type === 'storage') removed++
        return realRemove.call(this, type, ...rest)
      }
      try {
        const { unmount } = renderHook(() => useGuestMode())
        unmount()
        expect(added).toBe(removed)
        expect(added).toBeGreaterThan(0)
      } finally {
        window.addEventListener = realAdd
        window.removeEventListener = realRemove
      }
    })
  })
})
