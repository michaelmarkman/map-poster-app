import React, { useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { fetchPosts } from './lib/community.js'

// ─── Intersection Observer hook ───
function useInView(options = {}) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.unobserve(el) }
    }, { threshold: 0.15, ...options })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, visible]
}

function FadeIn({ children, className = '', delay = 0 }) {
  const [ref, visible] = useInView()
  return (
    <div
      ref={ref}
      className={`fade-in ${visible ? 'visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

// ─── Navbar ───
function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className="nav" style={{ borderBottomColor: scrolled ? undefined : 'transparent' }}>
      <div className="nav-inner">
        <a href="./" className="nav-logo">MapPoster</a>
        <div className="nav-links">
          <a href="./community.html">Community</a>
          <a href="./pricing.html">Pricing</a>
          <a href="./poster-v3-ui.html" className="btn btn-primary btn-sm">Start Creating</a>
        </div>
      </div>
    </nav>
  )
}

// ─── Hero ───
function Hero() {
  return (
    <section className="hero">
      <div className="hero-bg" />
      <div className="hero-grid-bg" />
      <div className="hero-content">
        <div className="hero-badge">3D Aerial Map Art</div>
        <h1>Your city, <em>reimagined</em></h1>
        <p className="hero-sub">
          Transform any location into stunning 3D aerial tilt-shift map posters.
          Search, customize the view, apply cinematic effects, and export print-ready art.
        </p>
        <div className="hero-ctas">
          <a href="./poster-v3-ui.html" className="btn btn-primary btn-lg">Start Creating</a>
          <a href="./community.html" className="btn btn-secondary btn-lg">Explore Gallery</a>
        </div>

        <div className="hero-visual">
          <div className="hero-poster-wrap">
            <div className="hero-poster">
              <div className="hero-poster-inner">
                <div className="poster-globe-icon">🌍</div>
                <div className="poster-label">San Francisco, CA</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── How It Works ───
function HowItWorks() {
  const steps = [
    { icon: '🔍', title: 'Search any location', desc: 'Type a city, address, or landmark. Our 3D globe instantly flies you there with Google photorealistic tiles.' },
    { icon: '🎨', title: 'Customize your view', desc: 'Adjust the camera angle, time of day, lighting, depth-of-field, and apply AI-powered artistic styles.' },
    { icon: '🖨️', title: 'Export & print', desc: 'Download high-resolution poster-ready images. Share to the community or order a print.' },
  ]

  return (
    <section className="how-section container">
      <FadeIn>
        <div className="section-title">
          <h2>How it works</h2>
          <p>Three steps to transform any place into wall-worthy art</p>
        </div>
      </FadeIn>
      <div className="steps-grid">
        {steps.map((s, i) => (
          <FadeIn key={i} delay={i * 120}>
            <div className="step-card">
              <div className="step-icon">{s.icon}</div>
              <div className="step-number">Step {i + 1}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          </FadeIn>
        ))}
      </div>
    </section>
  )
}

// ─── Gallery Preview ───
function GalleryPreview() {
  const [posts, setPosts] = useState([])

  useEffect(() => {
    fetchPosts({ sort: 'most_liked', limit: 6 })
      .then(setPosts)
      .catch(() => {})
  }, [])

  // Placeholder data when Supabase isn't configured
  const placeholders = [
    { title: 'Golden Hour Tokyo', location: 'Tokyo, Japan' },
    { title: 'NYC From Above', location: 'New York, USA' },
    { title: 'Paris at Dawn', location: 'Paris, France' },
    { title: 'London Eye View', location: 'London, UK' },
    { title: 'Sydney Harbor', location: 'Sydney, Australia' },
    { title: 'Rome Eternal', location: 'Rome, Italy' },
  ]

  const items = posts.length > 0 ? posts : placeholders

  return (
    <section className="gallery-section container">
      <FadeIn>
        <div className="section-title">
          <h2>Community creations</h2>
          <p>See what others have built with MapPoster</p>
        </div>
      </FadeIn>
      <div className="gallery-preview-grid">
        {items.map((item, i) => (
          <FadeIn key={i} delay={i * 80}>
            <div className="gallery-preview-card">
              {item.image_url ? (
                <>
                  <img src={item.image_url} alt={item.title} loading="lazy" />
                  <div className="gp-overlay">
                    <div className="gp-title">{item.title}</div>
                    <div className="gp-location">{item.location_name}</div>
                  </div>
                </>
              ) : (
                <div className="gallery-preview-placeholder">
                  <div className="gpp-icon">🗺️</div>
                  <div>{item.title}</div>
                  <div style={{ fontSize: 11, opacity: 0.5 }}>{item.location}</div>
                </div>
              )}
            </div>
          </FadeIn>
        ))}
      </div>
      <FadeIn>
        <div className="see-more">
          <a href="./community.html" className="btn btn-secondary">See more in the gallery &rarr;</a>
        </div>
      </FadeIn>
    </section>
  )
}

// ─── Pricing ───
function Pricing() {
  return (
    <section className="pricing-section container">
      <FadeIn>
        <div className="section-title">
          <h2>Simple pricing</h2>
          <p>Start free, upgrade when you need more</p>
        </div>
      </FadeIn>
      <FadeIn delay={100}>
        <div className="pricing-grid">
          <div className="pricing-card">
            <div className="pricing-price">Free</div>
            <div className="pricing-period">forever</div>
            <ul className="pricing-features">
              <li>Standard resolution exports</li>
              <li>5 saved views</li>
              <li>All AI art styles</li>
              <li>Community gallery access</li>
            </ul>
            <a href="./poster-v3-ui.html" className="btn btn-secondary" style={{ width: '100%' }}>Get started</a>
          </div>
          <div className="pricing-card featured">
            <div className="pricing-badge">Popular</div>
            <div className="pricing-price">$9<span style={{ fontSize: 16, color: 'var(--ink-dim)' }}>/mo</span></div>
            <div className="pricing-period">billed monthly</div>
            <ul className="pricing-features">
              <li>High-resolution exports (4K+)</li>
              <li>Unlimited saved views</li>
              <li>No watermark</li>
              <li>Priority AI rendering</li>
              <li>Early access to new styles</li>
            </ul>
            <button className="btn btn-primary" style={{ width: '100%' }}>Coming soon</button>
          </div>
        </div>
      </FadeIn>
    </section>
  )
}

// ─── Footer ───
function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-col">
          <h4>MapPoster</h4>
          <a href="./">Home</a>
          <a href="./poster-v3-ui.html">Editor</a>
          <a href="./community.html">Community</a>
          <a href="./pricing.html">Pricing</a>
        </div>
        <div className="footer-col">
          <h4>Legal</h4>
          <a href="#">Terms of Service</a>
          <a href="#">Privacy Policy</a>
        </div>
        <div className="footer-col">
          <h4>Connect</h4>
          <a href="#">Twitter</a>
          <a href="#">Instagram</a>
          <a href="#">Discord</a>
        </div>
      </div>
      <div className="footer-bottom container">
        Made with &#9829; and Google 3D Tiles
      </div>
    </footer>
  )
}

// ─── CTA ───
function CTA() {
  return (
    <section className="cta-section container">
      <FadeIn>
        <h2>Ready to create something beautiful?</h2>
        <p>No account needed. Jump in and start exploring the world in 3D.</p>
        <a href="./poster-v3-ui.html" className="btn btn-primary btn-lg">Open the Editor</a>
      </FadeIn>
    </section>
  )
}

// ─── App ───
function App() {
  return (
    <>
      <Navbar />
      <Hero />
      <HowItWorks />
      <GalleryPreview />
      <Pricing />
      <CTA />
      <Footer />
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
