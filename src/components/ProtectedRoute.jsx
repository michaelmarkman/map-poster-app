import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

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

  if (!user) return <Navigate to="/login" replace />
  return children
}
