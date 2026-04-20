import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { friendlyError } from '../lib/errors'
import { enterGuestMode } from '../lib/guestMode'
import AuthLayout from '../components/auth/AuthLayout'
import AuthInput from '../components/auth/AuthInput'
import AuthButton from '../components/auth/AuthButton'

function validateUsername(username) {
  if (username.length < 3) return 'Username must be at least 3 characters'
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return 'Only letters, numbers, and underscores'
  return null
}

export default function SignupPage() {
  const { user, signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/app" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    const uErr = validateUsername(username)
    if (uErr) { setUsernameError(uErr); return }
    setUsernameError('')
    setError('')
    setLoading(true)
    try {
      await signUp(email, password, username)
      setSuccess(true)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <AuthLayout title="Check your email" subtitle="We sent a confirmation link. Click it to activate your account.">
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link to="/login" style={{ color: '#c8b897', textDecoration: 'none', fontSize: 14 }}>
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create account" subtitle="Start building beautiful map posters">
      <style>{`@keyframes shake { 0%, 100% { transform: translateX(0) } 20%, 60% { transform: translateX(-6px) } 40%, 80% { transform: translateX(6px) } } .auth-error.shake { animation: shake 0.4s ease }`}</style>
      <form onSubmit={handleSubmit}>
        <AuthInput
          label="Username" type="text" required autoComplete="username"
          value={username} onChange={e => { setUsername(e.target.value); setUsernameError('') }}
          error={usernameError}
        />
        <AuthInput
          label="Email" type="email" required autoComplete="email"
          value={email} onChange={e => setEmail(e.target.value)}
        />
        <AuthInput
          label="Password" type="password" required autoComplete="new-password"
          minLength={6} value={password} onChange={e => setPassword(e.target.value)}
        />
        {error && (
          <p className="auth-error shake" key={error} style={{ color: '#e55353', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
            {error}
          </p>
        )}
        <AuthButton loading={loading}>Create account</AuthButton>
      </form>
      <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: '#5a5750' }}>
        Already have an account?{' '}
        <Link to="/login" style={{ color: '#c8b897', textDecoration: 'none' }}>Sign in</Link>
      </div>
      <div style={{ marginTop: 24, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20, textAlign: 'center' }}>
        <button
          type="button"
          onClick={() => { enterGuestMode(); navigate('/app') }}
          style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
            color: '#8a8780', padding: '10px 20px', borderRadius: 8,
            fontSize: 13, cursor: 'pointer', width: '100%',
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#e8e4dc'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#8a8780'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
        >
          Skip — try as guest
        </button>
        <p style={{ color: '#5a5750', fontSize: 11, marginTop: 10 }}>
          Jump straight into the editor. No account needed.
        </p>
      </div>
    </AuthLayout>
  )
}
