import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { friendlyError } from '../lib/errors'
import AuthLayout from '../components/auth/AuthLayout'
import AuthInput from '../components/auth/AuthInput'
import AuthButton from '../components/auth/AuthButton'

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await resetPassword(email)
      setSuccess(true)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <AuthLayout title="Check your email" subtitle="If an account exists with that email, we sent a password reset link.">
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link to="/login" style={{ color: '#c8b897', textDecoration: 'none', fontSize: 14 }}>
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Reset password" subtitle="Enter your email to receive a reset link">
      <style>{`@keyframes shake { 0%, 100% { transform: translateX(0) } 20%, 60% { transform: translateX(-6px) } 40%, 80% { transform: translateX(6px) } } .auth-error.shake { animation: shake 0.4s ease }`}</style>
      <form onSubmit={handleSubmit}>
        <AuthInput
          label="Email" type="email" required autoComplete="email"
          value={email} onChange={e => setEmail(e.target.value)}
        />
        {error && (
          <p className="auth-error shake" key={error} style={{ color: '#e55353', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
            {error}
          </p>
        )}
        <AuthButton loading={loading}>Send reset link</AuthButton>
      </form>
      <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13 }}>
        <Link to="/login" style={{ color: '#8a8780', textDecoration: 'none' }}>
          Back to sign in
        </Link>
      </div>
    </AuthLayout>
  )
}
