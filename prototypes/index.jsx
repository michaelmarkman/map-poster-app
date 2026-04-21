import React, { useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './lib/error-boundary.jsx'
import { fetchPosts } from './lib/community.js'

// Kill switch mirrors PAYWALL_ENABLED in lib/pricing.js. When false,
// pricing nav/footer/section are hidden across the landing page.
const PAYWALL_ENABLED = false

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
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className="nav" style={{ borderBottomColor: scrolled ? undefined : 'transparent' }}>
      <div className="nav-inner">
        <a href="./" className="nav-logo">MapPoster</a>
        <button className="nav-hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Menu">
          {menuOpen ? '\u2715' : '\u2630'}
        </button>
        <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
          <a href="./poster-v3-ui.html">Editor</a>
          <a href="./community.html">Community</a>
          {PAYWALL_ENABLED && <a href="./pricing.html">Pricing</a>}
          <a href="/app" className="btn btn-primary btn-sm">Start Creating</a>
        </div>
      </div>
    </nav>
  )
}

// ─── Hero ───
function Hero() {
  const contentRef = useRef(null)
  const posterRef = useRef(null)

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      const vh = window.innerHeight
      if (y > vh) return
      const t = y / vh
      if (contentRef.current) {
        contentRef.current.style.opacity = String(1 - t * 1.2)
        contentRef.current.style.transform = `translateY(${y * 0.3}px)`
      }
      if (posterRef.current) {
        posterRef.current.style.transform = `translateY(${y * -0.15}px) scale(${1 - t * 0.1})`
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <section className="hero">
      <div className="hero-bg" />
      <div className="hero-grid-bg" />
      <div className="hero-content" ref={contentRef}>
        <div className="hero-badge">3D Aerial Map Art</div>
        <h1>Your city, <em>reimagined</em></h1>
        <p className="hero-sub">
          Transform any location into stunning 3D aerial tilt-shift map posters.
          Search, customize the view, apply cinematic effects, and export print-ready art.
        </p>
        <div className="hero-ctas">
          <a href="/app" className="btn btn-primary btn-lg">Start Creating</a>
          <a href="./community.html" className="btn btn-secondary btn-lg">Explore Gallery</a>
        </div>

        <div className="hero-proof">
          <span>No sign-up required</span>
          <span className="hero-proof-dot" />
          <span>Free to use</span>
          <span className="hero-proof-dot" />
          <span>Powered by Google 3D Tiles</span>
        </div>

        <div className="hero-visual" ref={posterRef}>
          <div className="hero-poster-wrap">
            <div className="hero-poster">
              <div className="hero-poster-inner">
                <div className="poster-shimmer" />
                <div className="poster-grid-overlay" />
                <div className="poster-content">
                  <div className="poster-silhouette" />
                  <div className="poster-label-group">
                    <div className="poster-label">San Francisco</div>
                    <div className="poster-sublabel">37.7749° N, 122.4194° W</div>
                  </div>
                </div>
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

// ─── Features ───
function Features() {
  const features = [
    { icon: '📐', title: 'Tilt-shift camera', desc: 'Adjust pitch, heading, and field of view for cinematic miniature effects.' },
    { icon: '🤖', title: 'AI style transfer', desc: 'Watercolor, oil paint, anime, blueprint — transform any view with Gemini AI.' },
    { icon: '🔭', title: 'Depth of field', desc: 'Focus on a landmark with adjustable bokeh blur for professional results.' },
    { icon: '🌅', title: 'Time of day', desc: 'Golden hour, blue hour, night — change lighting to set the mood.' },
    { icon: '🖼️', title: 'Print-ready export', desc: 'High-res output with bleed marks, perfect for gallery-quality prints.' },
    { icon: '💾', title: 'Saved views', desc: 'Bookmark camera angles and return to them anytime. Share links with others.' },
  ]
  return (
    <section className="features-section container">
      <FadeIn>
        <div className="section-title">
          <h2>A full creative toolkit</h2>
          <p>Everything you need to turn maps into art</p>
        </div>
      </FadeIn>
      <div className="features-grid">
        {features.map((f, i) => (
          <FadeIn key={i} delay={i * 80}>
            <div className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          </FadeIn>
        ))}
      </div>
    </section>
  )
}

// ─── Stats Strip ───
function StatsStrip() {
  const stats = [
    { value: '100%', label: 'Free to start' },
    { value: '3D', label: 'Photorealistic tiles' },
    { value: 'AI', label: 'Artistic style transfer' },
    { value: '4K+', label: 'Export resolution' },
  ]
  return (
    <section className="stats-strip container">
      <div className="stats-grid">
        {stats.map((s, i) => (
          <FadeIn key={i} delay={i * 80}>
            <div className="stat-item">
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </FadeIn>
        ))}
      </div>
    </section>
  )
}

// ─── Quick Start Locations ───
function QuickStart() {
  const locations = [
    { name: 'New York', emoji: '🗽', query: 'Empire State Building, New York' },
    { name: 'Paris', emoji: '🗼', query: 'Eiffel Tower, Paris' },
    { name: 'Tokyo', emoji: '⛩️', query: 'Shibuya Crossing, Tokyo' },
    { name: 'London', emoji: '🎡', query: 'Tower Bridge, London' },
    { name: 'San Francisco', emoji: '🌉', query: 'Golden Gate Bridge, San Francisco' },
    { name: 'Dubai', emoji: '🏗️', query: 'Burj Khalifa, Dubai' },
    { name: 'Rome', emoji: '🏛️', query: 'Colosseum, Rome' },
    { name: 'Sydney', emoji: '🎭', query: 'Sydney Opera House, Sydney' },
  ]

  return (
    <section className="quickstart-section container">
      <FadeIn>
        <div className="section-title">
          <h2>Jump right in</h2>
          <p>Click a city to start creating instantly</p>
        </div>
      </FadeIn>
      <div className="quickstart-grid">
        {locations.map((loc, i) => (
          <FadeIn key={i} delay={i * 60}>
            <a
              href={`./poster-v3-ui.html?q=${encodeURIComponent(loc.query)}`}
              className="quickstart-card"
            >
              <span className="quickstart-emoji">{loc.emoji}</span>
              <span className="quickstart-name">{loc.name}</span>
            </a>
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

// ─── Testimonials ───
function Testimonials() {
  const quotes = [
    { text: 'I printed a poster of our wedding venue as an anniversary gift. My wife cried.', author: 'Jake M.', role: 'First-time user' },
    { text: 'The AI style transfer is unreal — turned my neighborhood into a Studio Ghibli scene.', author: 'Priya K.', role: 'Digital artist' },
    { text: 'We use MapPoster for all our real estate listing flyers. Clients love the 3D aerial views.', author: 'Sarah L.', role: 'Real estate agent' },
  ]
  return (
    <section className="testimonials-section container">
      <FadeIn>
        <div className="section-title">
          <h2>Loved by creators</h2>
          <p>See what people are making with MapPoster</p>
        </div>
      </FadeIn>
      <div className="testimonials-grid">
        {quotes.map((q, i) => (
          <FadeIn key={i} delay={i * 100}>
            <blockquote className="testimonial-card">
              <p>&ldquo;{q.text}&rdquo;</p>
              <footer>
                <div className="testimonial-author">{q.author}</div>
                <div className="testimonial-role">{q.role}</div>
              </footer>
            </blockquote>
          </FadeIn>
        ))}
      </div>
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
        <div className="see-more" style={{ marginTop: 24 }}>
          <a href="./pricing.html" className="btn btn-secondary">Compare plans &amp; FAQ &rarr;</a>
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
          {PAYWALL_ENABLED && <a href="./pricing.html">Pricing</a>}
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
      <StatsStrip />
      <Features />
      <QuickStart />
      <GalleryPreview />
      <Testimonials />
      {PAYWALL_ENABLED && <Pricing />}
      <CTA />
      <Footer />
    </>
  )
}

createRoot(document.getElementById('root')).render(<ErrorBoundary name="landing"><App /></ErrorBoundary>)
