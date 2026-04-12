import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
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
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <AuthLayout title="Check your email" subtitle="We sent a confirmation link. Click it to activate your account.">
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link to="/login" style={{ color: '#c4a467', textDecoration: 'none', fontSize: 14 }}>
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create account" subtitle="Start building beautiful map posters">
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
          <p style={{ color: '#e55353', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
            {error}
          </p>
        )}
        <AuthButton loading={loading}>Create account</AuthButton>
      </form>
      <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: '#5a5750' }}>
        Already have an account?{' '}
        <Link to="/login" style={{ color: '#c4a467', textDecoration: 'none' }}>Sign in</Link>
      </div>
    </AuthLayout>
  )
}
