import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { friendlyError } from '../lib/errors'
import AuthLayout from '../components/auth/AuthLayout'
import AuthInput from '../components/auth/AuthInput'
import AuthButton from '../components/auth/AuthButton'

export default function LoginPage() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/app" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/app')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your account">
      <style>{`@keyframes shake { 0%, 100% { transform: translateX(0) } 20%, 60% { transform: translateX(-6px) } 40%, 80% { transform: translateX(6px) } } .auth-error.shake { animation: shake 0.4s ease }`}</style>
      <form onSubmit={handleSubmit}>
        <AuthInput
          label="Email" type="email" required autoComplete="email"
          value={email} onChange={e => setEmail(e.target.value)}
        />
        <AuthInput
          label="Password" type="password" required autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)}
        />
        {error && (
          <p className="auth-error shake" key={error} style={{ color: '#e55353', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
            {error}
          </p>
        )}
        <AuthButton loading={loading}>Sign in</AuthButton>
      </form>
      <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13 }}>
        <Link to="/forgot-password" style={{ color: '#8a8780', textDecoration: 'none' }}>
          Forgot password?
        </Link>
      </div>
      <div style={{ marginTop: 12, textAlign: 'center', fontSize: 13, color: '#5a5750' }}>
        Don&apos;t have an account?{' '}
        <Link to="/signup" style={{ color: '#c8b897', textDecoration: 'none' }}>Sign up</Link>
      </div>
    </AuthLayout>
  )
}
