import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { aiApiKeyAtom } from '../../editor/atoms/sidebar'
import { getTierLimits } from '../../../lib/entitlements'
import { getRenderCount } from '../../../lib/renderCount'

// Phase 6.1 — small visible chip showing renders remaining this month.
// Hidden when the user has BYOK set (no Vedute-side limit applies) and
// when the user is on Pro tier (effectively unlimited).
//
// Updates on:
//   - mount (initial read)
//   - 'gallery-add' window event (every successful render dispatches it,
//     so the count updates the moment a render finishes — no polling)
//   - window focus (catches state changes from another tab)
export default function RenderCountChip() {
  const aiKey = useAtomValue(aiApiKeyAtom)
  // Read from the active-profile bridge — getTierLimits() with no arg
  // resolves to the live profile's tier (Phase 6 plumbing).
  const limits = getTierLimits()
  const monthly = limits.rendersPerMonth
  const [count, setCount] = useState(() => getRenderCount())

  useEffect(() => {
    const refresh = () => setCount(getRenderCount())
    window.addEventListener('focus', refresh)
    window.addEventListener('gallery-add', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('gallery-add', refresh)
    }
  }, [])

  if (aiKey) return null
  if (!Number.isFinite(monthly)) return null

  const remaining = Math.max(0, monthly - count)
  const dim = remaining === 0
  // Flush pending session-persistence save before SPA nav. The
  // persistence hook's 500ms debounce won't fire on its own when we
  // navigate within the SPA (no beforeunload / pagehide), so without
  // this the user could lose 0–500ms of recent changes by clicking
  // the chip quickly. save-session listener exists in
  // useSessionPersistence; fires writeNow() synchronously.
  const flushOnClick = () => {
    try { window.dispatchEvent(new Event('save-session')) } catch {}
  }
  return (
    <Link
      to="/profile"
      onClick={flushOnClick}
      className={`mock-rc-chip${dim ? ' is-empty' : ''}`}
      title={
        remaining === 0
          ? "You've used all this month's free renders. Click to upgrade or set your own key."
          : `${remaining} of ${monthly} AI renders left this month. Click to manage your plan.`
      }
    >
      {remaining}/{monthly}
    </Link>
  )
}
