import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const s = {
  page: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: '#09090b', padding: '40px 24px', textAlign: 'center',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  title: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 48, fontWeight: 400, color: '#e8e4dc', marginBottom: 16,
    fontStyle: 'italic',
  },
  accent: { color: '#c8b897' },
  sub: { color: '#5a5750', fontSize: 16, maxWidth: 480, marginBottom: 40, lineHeight: 1.6 },
  btn: {
    display: 'inline-block', padding: '14px 32px', background: '#c8b897',
    color: '#09090b', border: 'none', borderRadius: 8, fontSize: 15,
    fontWeight: 600, textDecoration: 'none', cursor: 'pointer',
  },
  secondary: {
    display: 'inline-block', padding: '14px 32px', background: '#151518',
    border: '1px solid rgba(255,255,255,0.08)', color: '#e8e4dc',
    borderRadius: 8, fontSize: 15, textDecoration: 'none', marginLeft: 12,
  },
}

export default function LandingPage() {
  const { user } = useAuth()

  return (
    <div style={s.page}>
      <h1 style={s.title}>
        Map<span style={s.accent}>Poster</span>
      </h1>
      <p style={s.sub}>
        Create stunning 3D map posters of any place on Earth.
        Choose your style, frame it, and share it with the world.
      </p>
      <div>
        {user ? (
          <Link to="/app" style={s.btn}>Open editor</Link>
        ) : (
          <>
            <Link to="/signup" style={s.btn}>Get started</Link>
            <Link to="/login" style={s.secondary}>Sign in</Link>
          </>
        )}
      </div>
    </div>
  )
}
