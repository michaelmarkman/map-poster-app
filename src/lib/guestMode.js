// Guest-mode flag — lets friends try the app without creating an account.
// ProtectedRoute reads this; LoginPage/SignupPage set it when the user picks
// "Continue as guest". Stored in localStorage so it persists across reloads.
import { useEffect, useState } from 'react'

const GUEST_KEY = 'guest_mode'
const EVT = 'guest-mode-changed'

export function isGuest() {
  try { return localStorage.getItem(GUEST_KEY) === 'true' } catch { return false }
}

export function enterGuestMode() {
  try { localStorage.setItem(GUEST_KEY, 'true') } catch {}
  try { window.dispatchEvent(new Event(EVT)) } catch {}
}

export function exitGuestMode() {
  try { localStorage.removeItem(GUEST_KEY) } catch {}
  try { window.dispatchEvent(new Event(EVT)) } catch {}
}

export function useGuestMode() {
  const [guest, setGuest] = useState(() => isGuest())
  useEffect(() => {
    const on = () => setGuest(isGuest())
    window.addEventListener(EVT, on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener(EVT, on)
      window.removeEventListener('storage', on)
    }
  }, [])
  return guest
}
