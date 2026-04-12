import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const accent = '#c8b897'

const s = {
  page: {
    minHeight: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column',
    background: '#09090b',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  hero: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '80px 24px 60px', textAlign: 'center', flex: 1,
  },
  title: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 'clamp(36px, 6vw, 56px)', fontWeight: 400, color: '#e8e4dc',
    marginBottom: 16, fontStyle: 'italic', lineHeight: 1.1,
  },
  accent: { color: accent },
  sub: {
    color: '#5a5750', fontSize: 'clamp(14px, 2vw, 16px)',
    maxWidth: 480, marginBottom: 40, lineHeight: 1.6,
  },
  btn: {
    display: 'inline-block', padding: '14px 32px', background: accent,
    color: '#09090b', border: 'none', borderRadius: 8, fontSize: 15,
    fontWeight: 600, textDecoration: 'none', cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  secondary: {
    display: 'inline-block', padding: '14px 32px', background: '#151518',
    border: '1px solid rgba(255,255,255,0.08)', color: '#e8e4dc',
    borderRadius: 8, fontSize: 15, textDecoration: 'none', marginLeft: 12,
    transition: 'border-color 0.15s',
  },
  features: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 24, padding: '0 24px 80px', maxWidth: 960, margin: '0 auto', width: '100%',
  },
  card: {
    background: '#111114', borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.04)',
    padding: '28px 24px',
  },
  cardTitle: {
    color: '#e8e4dc', fontSize: 15, fontWeight: 600, marginBottom: 8,
  },
  cardText: {
    color: '#5a5750', fontSize: 13, lineHeight: 1.6,
  },
  footer: {
    borderTop: '1px solid rgba(255,255,255,0.04)',
    padding: '24px', textAlign: 'center',
    color: '#3a3835', fontSize: 12,
  },
}

const features = [
  { title: '3D Globe View', text: 'Explore any place on Earth with photorealistic 3D tiles and atmospheric effects.' },
  { title: 'Art Styles', text: 'Choose from dozens of poster styles — minimal, watercolor, sketch, halftone, and more.' },
  { title: 'Time Machine', text: 'Set the time of day with golden hour, blue hour, and sunset lighting.' },
  { title: 'Export & Print', text: 'High-resolution export ready for printing, framing, or sharing online.' },
]

export default function LandingPage() {
  const { user } = useAuth()

  return (
    <div style={s.page}>
      <div style={s.hero}>
        <h1 style={s.title}>
          Map<span style={s.accent}>Poster</span>
        </h1>
        <p style={s.sub}>
          Create stunning 3D map posters of any place on Earth.
          Choose your style, frame it, and share it with the world.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
          <a href="/prototypes/poster-v3-ui.html" style={s.btn}>
            {user ? 'Open editor' : 'Try it free'}
          </a>
          <a href="/prototypes/community.html" style={s.secondary}>
            Browse gallery
          </a>
        </div>
      </div>

      <div style={s.features}>
        {features.map(f => (
          <div key={f.title} style={s.card}>
            <h3 style={s.cardTitle}>{f.title}</h3>
            <p style={s.cardText}>{f.text}</p>
          </div>
        ))}
      </div>

      <footer style={s.footer}>
        MapPoster — Beautiful maps, framed your way
      </footer>
    </div>
  )
}
