import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const accent = '#c8b897'

const s = {
  nav: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 24px', background: 'rgba(9,9,11,0.85)', backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  logo: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 18, fontWeight: 400, color: accent,
    textDecoration: 'none', fontStyle: 'italic',
  },
  navLink: {
    color: '#8a8780', textDecoration: 'none', fontSize: 13,
    padding: '6px 12px', borderRadius: 6, transition: 'color 0.15s',
  },
  btn: {
    padding: '7px 16px', background: accent, color: '#09090b',
    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', textDecoration: 'none',
  },
  avatar: {
    width: 32, height: 32, borderRadius: '50%', background: '#151518',
    border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, color: accent, fontWeight: 600, overflow: 'hidden',
  },
  dropdown: {
    position: 'absolute', top: 48, right: 0, background: '#0f0f12',
    border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
    padding: '4px 0', minWidth: 180, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  dropItem: {
    display: 'block', width: '100%', padding: '10px 16px',
    background: 'none', border: 'none', color: '#e8e4dc',
    fontSize: 13, textAlign: 'left', cursor: 'pointer',
    textDecoration: 'none',
  },
  hamburger: {
    display: 'none', background: 'none', border: 'none',
    color: '#8a8780', cursor: 'pointer', padding: 8, fontSize: 20,
  },
}

export default function Navbar() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [dropOpen, setDropOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const dropRef = useRef(null)

  useEffect(() => {
    function close(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setDropOpen(false)
        setMobileOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const handler = () => { if (mq.matches) setMobileOpen(false) }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const initials = (profile?.display_name || profile?.username || user?.email || '?')[0].toUpperCase()

  async function handleSignOut() {
    await signOut()
    setDropOpen(false)
    setMobileOpen(false)
    navigate('/')
  }

  // Phase 1.2 follow-up — the desktop nav links used to point at static
  // prototype HTML pages (`/prototypes/poster-v3-ui.html`,
  // `/prototypes/community.html`) from before the React migration. The
  // actual product is at `/app` and `/community` now; the prototype
  // pages are still served (vercel.json) but they're frozen reference
  // implementations, not what we want to send users to from Vedute's
  // own navbar.
  const navLinks = (
    <>
      <Link to="/app" style={s.navLink}>Create</Link>
      <Link to="/community" style={s.navLink}>Community</Link>
    </>
  )

  return (
    <>
      <style>{`
        @media (max-width: 639px) {
          .nav-hamburger { display: flex !important; }
          .nav-links-desktop { display: none !important; }
        }
        .nav-link:hover { color: #e8e4dc !important; }
        .drop-item:hover { background: rgba(255,255,255,0.04) !important; }
      `}</style>
      <nav style={s.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/" style={s.logo}>Vedute</Link>
          <div className="nav-links-desktop" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {navLinks}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {user ? (
            <div ref={dropRef} style={{ position: 'relative' }}>
              <button
                type="button"
                style={{ ...s.avatar, padding: 0 }}
                onClick={() => setDropOpen(!dropOpen)}
                aria-haspopup="menu"
                aria-expanded={dropOpen}
                aria-label="Account menu"
              >
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials}
              </button>
              {dropOpen && (
                <div style={s.dropdown}>
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: 13, color: '#e8e4dc' }}>{profile?.display_name || profile?.username}</div>
                    <div style={{ fontSize: 11, color: '#5a5750' }}>{user.email}</div>
                  </div>
                  <Link to="/gallery" className="drop-item" style={s.dropItem} onClick={() => setDropOpen(false)}>My Gallery</Link>
                  <Link to="/profile" className="drop-item" style={s.dropItem} onClick={() => setDropOpen(false)}>Profile</Link>
                  <button
                    onClick={handleSignOut}
                    className="drop-item"
                    style={{ ...s.dropItem, color: '#e55353', borderTop: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="nav-links-desktop" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Link to="/login" style={s.navLink}>Sign in</Link>
              <Link to="/signup" style={s.btn}>Sign up</Link>
            </div>
          )}

          {/* Mobile hamburger */}
          <button
            type="button"
            className="nav-hamburger"
            style={s.hamburger}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="nav-mobile-drawer"
          >
            {mobileOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          id="nav-mobile-drawer"
          role="menu"
          style={{
            position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
            background: 'rgba(9,9,11,0.97)', backdropFilter: 'blur(12px)',
            zIndex: 99, padding: '24px',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}
        >
          <Link to="/app" style={{ ...s.navLink, fontSize: 16, padding: '12px 0' }} onClick={() => setMobileOpen(false)}>Create</Link>
          <Link to="/community" style={{ ...s.navLink, fontSize: 16, padding: '12px 0' }} onClick={() => setMobileOpen(false)}>Community</Link>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '8px 0' }} />
          {user ? (
            <>
              <Link to="/gallery" style={{ ...s.navLink, fontSize: 16, padding: '12px 0' }} onClick={() => setMobileOpen(false)}>My Gallery</Link>
              <Link to="/profile" style={{ ...s.navLink, fontSize: 16, padding: '12px 0' }} onClick={() => setMobileOpen(false)}>Profile</Link>
              <button onClick={handleSignOut} style={{ ...s.navLink, fontSize: 16, padding: '12px 0', color: '#e55353', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}>Sign out</button>
            </>
          ) : (
            <>
              <Link to="/login" style={{ ...s.navLink, fontSize: 16, padding: '12px 0' }} onClick={() => setMobileOpen(false)}>Sign in</Link>
              <Link to="/signup" style={{ ...s.btn, display: 'block', textAlign: 'center', marginTop: 8, padding: '12px 0' }} onClick={() => setMobileOpen(false)}>Sign up</Link>
            </>
          )}
        </div>
      )}
    </>
  )
}
