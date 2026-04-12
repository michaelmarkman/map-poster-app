import React, { useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { fetchProfile, fetchUserPosts } from './lib/community.js'

// ─── Intersection Observer hook ───
function useInView(options = {}) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.unobserve(el) }
    }, { threshold: 0.1, ...options })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, visible]
}

function FadeIn({ children, className = '', delay = 0 }) {
  const [ref, visible] = useInView()
  return (
    <div ref={ref} className={`fade-in ${visible ? 'visible' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

function Navbar() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <a href="./" className="nav-logo">MapPoster</a>
        <div className="nav-links">
          <a href="./poster-v2.html">Editor</a>
          <a href="./community.html">Community</a>
          <a href="./pricing.html">Pricing</a>
          <a href="./poster-v2.html" className="btn btn-primary btn-sm">Create</a>
        </div>
      </div>
    </nav>
  )
}

function ProfileHeader({ profile }) {
  const joinDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : ''

  return (
    <div className="profile-header">
      {profile.avatar_url
        ? <img className="profile-avatar" src={profile.avatar_url} alt="" />
        : <div className="profile-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, color: 'var(--ink-dim)' }}>
            {(profile.display_name || profile.username || '?')[0].toUpperCase()}
          </div>}
      <div>
        <div className="profile-name">{profile.display_name || profile.username}</div>
        <div className="profile-username">@{profile.username}</div>
        {profile.bio && <div className="profile-bio">{profile.bio}</div>}
        <div className="profile-stats-row">
          {joinDate && <span>Joined {joinDate}</span>}
          <span><strong>{profile.post_count || 0}</strong> posts</span>
          <span><strong>{profile.follower_count || 0}</strong> followers</span>
        </div>
      </div>
    </div>
  )
}

function PostGrid({ posts }) {
  if (posts.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🗺️</div>
        <h3>No posts yet</h3>
        <p>This user hasn't shared any creations.</p>
      </div>
    )
  }

  return (
    <div className="gallery-masonry">
      {posts.map((post, i) => (
        <FadeIn key={post.id} delay={i * 50}>
          <a href={`./community.html?post=${post.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card">
              <img className="card-image" src={post.image_url} alt={post.title} loading="lazy" />
              <div className="card-body">
                <div className="card-title">{post.title}</div>
                {post.location_name && <div className="card-location">{post.location_name}</div>}
                <div className="card-stats">
                  <span>&#9829; {post.like_count || 0}</span>
                  <span>&#9733; {post.save_count || 0}</span>
                </div>
              </div>
            </div>
          </a>
        </FadeIn>
      ))}
    </div>
  )
}

function App() {
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const username = new URLSearchParams(window.location.search).get('u')

  useEffect(() => {
    if (!username) {
      setError('No username specified')
      setLoading(false)
      return
    }

    Promise.all([
      fetchProfile(username),
      fetchUserPosts(username)
    ]).then(([prof, userPosts]) => {
      setProfile(prof)
      setPosts(userPosts)
      document.title = `${prof.display_name || prof.username} — MapPoster`
      setLoading(false)
    }).catch(err => {
      setError('User not found')
      setLoading(false)
    })
  }, [username])

  return (
    <>
      <Navbar />
      <main className="container" style={{ paddingTop: 80 }}>
        {loading ? (
          <div className="spinner" />
        ) : error ? (
          <div className="empty-state">
            <div className="empty-state-icon">👤</div>
            <h3>{error}</h3>
            <a href="./community.html" className="btn btn-secondary" style={{ marginTop: 16 }}>
              Browse Community
            </a>
          </div>
        ) : (
          <>
            <FadeIn>
              <ProfileHeader profile={profile} />
            </FadeIn>
            <FadeIn delay={100}>
              <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 24, marginBottom: 24 }}>
                Creations
              </h2>
            </FadeIn>
            <PostGrid posts={posts} />
          </>
        )}
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-col">
            <h4>MapPoster</h4>
            <a href="./">Home</a>
            <a href="./poster-v2.html">Editor</a>
            <a href="./community.html">Community</a>
          </div>
        </div>
        <div className="footer-bottom container">
          Made with &#9829; and Google 3D Tiles
        </div>
      </footer>
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
