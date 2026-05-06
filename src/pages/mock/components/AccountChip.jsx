import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { useGuestMode } from '../../../lib/guestMode'

// Avatar pill with click-to-open account dropdown. Lives in the
// top-left cluster of /app. Mirrors src/components/layout/Navbar.jsx's
// avatar dropdown but rendered as a glass pill that fits the editor
// chrome rather than the navbar's flat dark surface.
//
// Logged in: avatar / initials → click opens dropdown with
//            display name + email, My Gallery, Profile, Sign out.
// Guest:     placeholder glyph → click opens dropdown with
//            Sign in, Sign up.
//
// SPA nav from inside the editor doesn't fire beforeunload, so the
// debounced session-persistence save won't auto-flush. Every link
// dispatches `save-session` on click before navigating, matching the
// existing pattern in GuestSignInChip / RenderCountChip.

export default function AccountChip() {
  const { user, profile, signOut } = useAuth()
  const guest = useGuestMode()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // Capture phase + pointerdown so the WebGL canvas (which captures
    // pointerdown for click-to-focus) doesn't swallow the close.
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Flush the debounced save before any SPA navigation so users don't
  // lose recent edits when clicking through to /gallery, /profile,
  // /login, /signup, or signing out.
  const flush = () => {
    try {
      window.dispatchEvent(new Event('save-session'))
    } catch {}
  }

  const handleSignOut = async () => {
    flush()
    setOpen(false)
    try {
      await signOut()
    } catch {}
    navigate('/')
  }

  // Don't render if there's nothing meaningful — should be impossible
  // (guest mode + auth always resolve to one branch or the other) but
  // keeps the component a safe no-op if mounted out of context.
  if (!user && !guest) return null

  const initial = (
    profile?.display_name ||
    profile?.username ||
    user?.email ||
    '?'
  )[0].toUpperCase()

  return (
    <div ref={wrapRef} className="mock-account-wrap">
      <button
        type="button"
        className={`mock-account-chip${open ? ' is-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            className="mock-account-avatar"
          />
        ) : (
          <span className="mock-account-initial">{user ? initial : '·'}</span>
        )}
      </button>

      {open && (
        <div className="mock-account-menu" role="menu">
          {user ? (
            <>
              <div className="mock-account-header">
                <div className="mock-account-name">
                  {profile?.display_name || profile?.username || 'Anonymous'}
                </div>
                <div className="mock-account-email">{user.email}</div>
              </div>
              <Link
                to="/gallery"
                className="mock-account-item"
                role="menuitem"
                onClick={() => {
                  flush()
                  setOpen(false)
                }}
              >
                My Gallery
              </Link>
              <Link
                to="/profile"
                className="mock-account-item"
                role="menuitem"
                onClick={() => {
                  flush()
                  setOpen(false)
                }}
              >
                Profile
              </Link>
              <button
                type="button"
                className="mock-account-item mock-account-item--danger"
                role="menuitem"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <div className="mock-account-header">
                <div className="mock-account-name">Guest</div>
                <div className="mock-account-email">
                  Sign in to save your work
                </div>
              </div>
              <Link
                to="/login"
                className="mock-account-item"
                role="menuitem"
                onClick={() => {
                  flush()
                  setOpen(false)
                }}
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                className="mock-account-item mock-account-item--accent"
                role="menuitem"
                onClick={() => {
                  flush()
                  setOpen(false)
                }}
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}
