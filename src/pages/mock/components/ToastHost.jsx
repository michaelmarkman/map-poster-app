import { useEffect, useState, useRef, useCallback } from 'react'

// Listens for `toast` window events and renders a stack of dismissible
// notifications. useSavedViews's fireToast (and any future caller) finally
// has a renderer — before this component, those events vanished into the
// void.
//
// Stack of up to 3 toasts; older ones auto-expire after TOAST_TTL ms.
// Click → dismiss immediately.

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
        return next.slice(-MAX_TOASTS)
      })
      const tm = setTimeout(() => dismiss(id), TOAST_TTL)
      timersRef.current.set(id, tm)
    }
    window.addEventListener('toast', onToast)
    return () => {
      window.removeEventListener('toast', onToast)
      for (const tm of timersRef.current.values()) clearTimeout(tm)
      timersRef.current.clear()
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
