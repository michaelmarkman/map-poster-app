// Shared toast dispatcher. Every caller used to inline
// `window.dispatchEvent(new CustomEvent('toast', ...))` (or define their
// own fireToast helper) — five copies drifted apart across the codebase
// (ProfilePage, useQueue, useSavedViews, ClusterTopLeft, share.js).
// Pin the channel + payload shape here so ToastHost stays the only
// renderer and callers never have to remember the event name or detail
// shape.
//
// Usage:
//   import { fireToast } from '../../lib/toast'
//   fireToast('success', 'Saved')
//   fireToast('error', 'Something went wrong')
//
// type:    'success' | 'error' | 'info' (ToastHost only styles success / error)
// message: string (rendered as plain text)

export function fireToast(type, message) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent('toast', { detail: { type, message } }),
    )
  } catch {
    // No listener / SSR / sealed window — silently drop. Toasts are
    // never load-bearing.
  }
}
