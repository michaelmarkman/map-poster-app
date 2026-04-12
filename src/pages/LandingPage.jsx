import { useEffect, useRef, useState } from 'react'
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
    position: 'relative', overflow: 'hidden',
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
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  secondary: {
    display: 'inline-block', padding: '14px 32px', background: '#151518',
    border: '1px solid rgba(255,255,255,0.08)', color: '#e8e4dc',
    borderRadius: 8, fontSize: 15, textDecoration: 'none',
    transition: 'border-color 0.2s, transform 0.2s',
  },
  features: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 24, padding: '0 24px 80px', maxWidth: 960, margin: '0 auto', width: '100%',
  },
  card: {
    background: '#111114', borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.04)',
    padding: '28px 24px',
    transition: 'transform 0.3s ease, border-color 0.3s ease',
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
  { icon: '🌍', title: '3D Globe View', text: 'Explore any place on Earth with photorealistic 3D tiles and atmospheric effects.' },
  { icon: '🎨', title: 'Art Styles', text: 'Choose from dozens of poster styles — minimal, watercolor, sketch, halftone, and more.' },
  { icon: '🌅', title: 'Time Machine', text: 'Set the time of day with golden hour, blue hour, and sunset lighting.' },
  { icon: '🖨️', title: 'Export & Print', text: 'High-resolution export ready for printing, framing, or sharing online.' },
]

function FadeInCard({ children, delay = 0 }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.unobserve(el) }
    }, { threshold: 0.15 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(24px)',
      transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
    }}>
      {children}
    </div>
  )
}

export default function LandingPage() {
  const { user } = useAuth()
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    let ticking = false
    function onScroll() {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(() => {
          setScrollY(window.scrollY)
          ticking = false
        })
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div style={s.page}>
      <style>{`
        @keyframes heroFadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hero-content { animation: heroFadeIn 0.8s ease-out both; }
        .hero-content > * { animation: heroFadeIn 0.8s ease-out both; }
        .hero-content > :nth-child(1) { animation-delay: 0.1s; }
        .hero-content > :nth-child(2) { animation-delay: 0.25s; }
        .hero-content > :nth-child(3) { animation-delay: 0.4s; }
        .landing-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(200,184,151,0.15); }
        .landing-btn-sec:hover { border-color: rgba(255,255,255,0.2) !important; transform: translateY(-1px); }
        .feature-card:hover { transform: translateY(-4px); border-color: rgba(200,184,151,0.12) !important; }
      `}</style>

      <div style={s.hero}>
        {/* Parallax glow */}
        <div style={{
          position: 'absolute', top: '30%', left: '50%', width: 600, height: 600,
          borderRadius: '50%', background: `radial-gradient(circle, rgba(200,184,151,0.06) 0%, transparent 70%)`,
          transform: `translate(-50%, ${-scrollY * 0.3}px)`, pointerEvents: 'none',
        }} />

        <div className="hero-content" style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h1 style={{ ...s.title, transform: `translateY(${-scrollY * 0.15}px)` }}>
            Map<span style={s.accent}>Poster</span>
          </h1>
          <p style={{ ...s.sub, transform: `translateY(${-scrollY * 0.08}px)` }}>
            Create stunning 3D map posters of any place on Earth.
            Choose your style, frame it, and share it with the world.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            <a href="/prototypes/poster-v3-ui.html" className="landing-btn" style={s.btn}>
              {user ? 'Open editor' : 'Try it free'}
            </a>
            <a href="/prototypes/community.html" className="landing-btn-sec" style={s.secondary}>
              Browse gallery
            </a>
          </div>
        </div>
      </div>

      <div style={s.features}>
        {features.map((f, i) => (
          <FadeInCard key={f.title} delay={i * 100}>
            <div className="feature-card" style={s.card}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <h3 style={s.cardTitle}>{f.title}</h3>
              <p style={s.cardText}>{f.text}</p>
            </div>
          </FadeInCard>
        ))}
      </div>

      <footer style={s.footer}>
        MapPoster — Beautiful maps, framed your way
      </footer>
    </div>
  )
}
