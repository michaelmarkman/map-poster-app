import { Link } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { useGuestMode } from '../../../lib/guestMode'

// Subtle "Sign in" chip — shown only for guests (unauthenticated users who
// explicitly or implicitly entered guest mode). Lives in the top-right pill
// cluster alongside DoF/Clouds.
export default function GuestSignInChip() {
  const { user } = useAuth()
  const guest = useGuestMode()
  if (user || !guest) return null
  return (
    <Link
      to="/login"
      className="mock-pill"
      style={{ textDecoration: 'none', color: '#c8b897' }}
      aria-label="Sign in to save your work"
    >
      <span className="mock-pill-label">Sign in</span>
    </Link>
  )
}
