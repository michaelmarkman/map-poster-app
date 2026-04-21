import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { enterGuestMode, useGuestMode } from '../lib/guestMode'

// `guestAllowed`: routes like /app can be used by guests. Routes without it
// (profile, gallery) still bounce unauth'd visitors to /login.
export default function ProtectedRoute({ children, guestAllowed = false }) {
  const { user, loading } = useAuth()
  const guest = useGuestMode()

  // Zero-friction direct visits to /app: flip the guest flag on arrival so
  // the rest of the UI (Navbar, sign-in chip) knows we're in guest mode.
  useEffect(() => {
    if (guestAllowed && !loading && !user && !guest) enterGuestMode()
  }, [guestAllowed, loading, user, guest])

  // No Supabase client = no auth backend configured (dev without env vars,
  // static preview deploys). Treat as public — the editor still works; it
  // just can't sign you in or sync to the server.
  if (!supabase) return children

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#09090b',
      }}>
        <div style={{
          width: 32, height: 32, border: '3px solid #1a1a1f',
          borderTopColor: '#c8b897', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (user) return children
  if (guestAllowed) return children
  return <Navigate to="/login" replace />
}
