import { useEffect, useState, useRef, useCallback } from 'react'
import './ToastHost.css'

// App-wide toast host. Listens for `toast` window events and renders a
// stack of dismissible notifications.
//
// Single source of truth — mount once at the App level so /profile,
// /community, and the editor all share one renderer. Before this lived
// only in MockEditorShell, so any toast dispatched from /profile (e.g.
// "Upgrade endpoint unreachable") fell into the void exactly like the
// pre-ToastHost fireToast bug from the editor.
//
// Stack capped at 3, auto-expire after TOAST_TTL ms, click → dismiss.

const TOAST_TTL = 4000
const MAX_TOASTS = 3

let _id = 0

export default function ToastHost() {
  const [toasts, setToasts] = useState([])
  const timersRef = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((cur) => cur.filter((t) => t.id !== id))
    const tm = timersRef.current.get(id)
    if (tm) {
      clearTimeout(tm)
      timersRef.current.delete(id)
    }
  }, [])

  useEffect(() => {
    const onToast = (e) => {
      const { type = 'info', message } = e?.detail || {}
      if (!message) return
      const id = ++_id
      setToasts((cur) => {
        const next = [...cur, { id, type, message }]
        if (next.length <= MAX_TOASTS) return next
        // Stack-cap overflow — clear timers for the toasts we're about
        // to drop so they don't fire dismiss() a few seconds later for
        // ids that were never visible. Tiny leak, but keeps the timers
        // map honest.
        const dropped = next.slice(0, next.length - MAX_TOASTS)
        for (const t of dropped) {
          const tm = timersRef.current.get(t.id)
          if (tm) {
            clearTimeout(tm)
            timersRef.current.delete(t.id)
          }
        }
        return next.slice(-MAX_TOASTS)
      })
      const tm = setTimeout(() => dismiss(id), TOAST_TTL)
      timersRef.current.set(id, tm)
    }
    window.addEventListener('toast', onToast)
    // Capture the ref into a local so cleanup uses the same Map instance
    // we registered timers on (the lint rule's concern: timersRef.current
    // could be reassigned between mount and unmount in the general case).
    const timers = timersRef.current
    return () => {
      window.removeEventListener('toast', onToast)
      for (const tm of timers.values()) clearTimeout(tm)
      timers.clear()
    }
  }, [dismiss])

  if (toasts.length === 0) return null
  return (
    <div className="vd-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`vd-toast vd-toast--${t.type}`}
          onClick={() => dismiss(t.id)}
        >
          {t.message}
        </button>
      ))}
    </div>
  )
}
