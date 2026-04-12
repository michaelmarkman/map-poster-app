import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

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
    fontSize: 18, fontWeight: 400, color: '#c4a467',
    textDecoration: 'none', fontStyle: 'italic',
  },
  link: {
    color: '#8a8780', textDecoration: 'none', fontSize: 13,
    padding: '6px 12px', borderRadius: 6, transition: 'color 0.15s',
  },
  btn: {
    padding: '7px 16px', background: '#c4a467', color: '#09090b',
    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', textDecoration: 'none',
  },
  avatar: {
    width: 32, height: 32, borderRadius: '50%', background: '#151518',
    border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, color: '#c4a467', fontWeight: 600, overflow: 'hidden',
  },
  dropdown: {
    position: 'absolute', top: 48, right: 24, background: '#0f0f12',
    border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
    padding: '4px 0', minWidth: 180, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  dropItem: {
    display: 'block', width: '100%', padding: '10px 16px',
    background: 'none', border: 'none', color: '#e8e4dc',
    fontSize: 13, textAlign: 'left', cursor: 'pointer',
    textDecoration: 'none',
  },
}

export default function Navbar() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const initials = (profile?.display_name || profile?.username || user?.email || '?')[0].toUpperCase()

  async function handleSignOut() {
    await signOut()
    setOpen(false)
    navigate('/')
  }

  return (
    <nav style={s.nav}>
      <Link to="/" style={s.logo}>MapPoster</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {user ? (
          <div ref={ref} style={{ position: 'relative' }}>
            <div style={s.avatar} onClick={() => setOpen(!open)}>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials}
            </div>
            {open && (
              <div style={s.dropdown}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: 13, color: '#e8e4dc' }}>{profile?.display_name || profile?.username}</div>
                  <div style={{ fontSize: 11, color: '#5a5750' }}>{user.email}</div>
                </div>
                <Link to="/gallery" style={s.dropItem} onClick={() => setOpen(false)}>My Gallery</Link>
                <Link to="/profile" style={s.dropItem} onClick={() => setOpen(false)}>Profile</Link>
                <button
                  onClick={handleSignOut}
                  style={{ ...s.dropItem, color: '#e55353', borderTop: '1px solid rgba(255,255,255,0.04)' }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <Link to="/login" style={s.link}>Sign in</Link>
            <Link to="/signup" style={s.btn}>Sign up</Link>
          </>
        )}
      </div>
    </nav>
  )
}
