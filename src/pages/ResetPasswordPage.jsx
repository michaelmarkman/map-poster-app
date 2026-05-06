import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { friendlyError } from '../lib/errors'
import AuthLayout from '../components/auth/AuthLayout'
import AuthInput from '../components/auth/AuthInput'
import AuthButton from '../components/auth/AuthButton'

// Click-target for the password-reset email Supabase sends. The link
// has a hash like #access_token=...&refresh_token=...&type=recovery
// — Supabase's onAuthStateChange picks that up and sets the session
// automatically. We just collect a new password and call
// updateUser({ password }).
//
// Edge cases:
//   - Hash missing (someone pastes the URL without it): we still let
//     them through; updatePassword will fail with a clear error.
//   - Token expired: Supabase returns a friendly error string mapped
//     by friendlyError to "That link has expired."
//   - Already-logged-in user: the form still works as a "change my
//     password" surface (Supabase routes both to updateUser).
export default function ResetPasswordPage() {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  // Track the redirect timer so unmounting (e.g. user clicks "Back to
  // sign in" on the success view) cancels the pending navigate('/app')
  // — without this, the redirect fires after a user has explicitly
  // navigated elsewhere.
  const redirectRef = useRef(null)

  // Some browsers leave the hash in the address bar after Supabase
  // hydrates the session. Clean it on mount so the recovery token
  // doesn't sit there in the user's URL bar (and isn't carried into
  // any subsequent navigation).
  useEffect(() => {
    if (window.location.hash) {
      try {
        const url = window.location.pathname + window.location.search
        window.history.replaceState(null, '', url)
      } catch {}
    }
    return () => {
      if (redirectRef.current) clearTimeout(redirectRef.current)
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    setLoading(true)
    try {
      await updatePassword(password)
      setDone(true)
      // Brief beat so the success state lands, then bounce into the
      // editor — Supabase already set a session as part of the
      // recovery link, so the user is logged in.
      redirectRef.current = setTimeout(() => navigate('/app'), 1200)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <AuthLayout title="Password updated" subtitle="Signing you in…">
        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#5a5750' }}>
          Redirecting to the editor.
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Enter and confirm your new password">
      <style>{`@keyframes shake { 0%, 100% { transform: translateX(0) } 20%, 60% { transform: translateX(-6px) } 40%, 80% { transform: translateX(6px) } } .auth-error.shake { animation: shake 0.4s ease }`}</style>
      <form onSubmit={handleSubmit}>
        <AuthInput
          label="New password" type="password" required autoComplete="new-password"
          minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
        />
        <AuthInput
          label="Confirm password" type="password" required autoComplete="new-password"
          minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)}
        />
        {error && (
          <p className="auth-error shake" key={error} style={{ color: '#e55353', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
            {error}
          </p>
        )}
        <AuthButton loading={loading}>Update password</AuthButton>
      </form>
      <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13 }}>
        <Link to="/login" style={{ color: '#8a8780', textDecoration: 'none' }}>
          Back to sign in
        </Link>
      </div>
    </AuthLayout>
  )
}
