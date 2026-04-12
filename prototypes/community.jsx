import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { useAuth } from './lib/useAuth.js'
import {
  fetchPosts, fetchPost, toggleLike, toggleSave, checkLiked, checkSaved,
  shareToTwitter, shareToFacebook, copyPostLink, getPostUrl
} from './lib/community.js'

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

// ─── Toast ───
function Toast({ message }) {
  return <div className={`toast ${message ? 'show' : ''}`}>{message}</div>
}

// ─── Navbar ───
function Navbar() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <a href="/src/" className="nav-logo">MapPoster</a>
        <div className="nav-links">
          <a href="./community.html" style={{ color: 'var(--ink)' }}>Community</a>
          <a href="./pricing.html">Pricing</a>
          <a href="./poster-v3-ui.html" className="btn btn-primary btn-sm">Create</a>
        </div>
      </div>
    </nav>
  )
}

// ─── Post Card ───
function PostCard({ post, onClick, onLike, onSave, liked, saved }) {
  const profile = post.profiles || {}
  return (
    <div className="card" onClick={() => onClick(post)}>
      <div className="card-image-wrap">
        <img className="card-image" src={post.image_url} alt={post.title} loading="lazy" />
        <div className="card-actions">
          <button
            className={`btn-icon ${liked ? 'active' : ''}`}
            onClick={e => { e.stopPropagation(); onLike(post.id) }}
            title="Like"
          >&#9829;</button>
          <button
            className={`btn-icon ${saved ? 'active' : ''}`}
            onClick={e => { e.stopPropagation(); onSave(post.id) }}
            title="Save"
          >&#9733;</button>
        </div>
      </div>
      <div className="card-body">
        <div className="card-meta">
          {profile.avatar_url
            ? <img className="card-avatar" src={profile.avatar_url} alt="" />
            : <div className="card-avatar" />}
          <a className="card-username" href={`./user.html?u=${profile.username || ''}`} onClick={e => e.stopPropagation()}>
            {profile.display_name || profile.username || 'Anonymous'}
          </a>
        </div>
        <div className="card-title">{post.title}</div>
        {post.location_name && <div className="card-location">{post.location_name}</div>}
        <div className="card-stats">
          <span>&#9829; {post.like_count || 0}</span>
          <span>&#9733; {post.save_count || 0}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Post Detail Modal ───
function PostDetail({ post, onClose, user, toast }) {
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [likeCount, setLikeCount] = useState(post.like_count || 0)
  const profile = post.profiles || {}

  useEffect(() => {
    if (!user) return
    checkLiked(post.id, user.id).then(setLiked)
    checkSaved(post.id, user.id).then(setSaved)
  }, [post.id, user])

  const handleLike = async () => {
    if (!user) return
    const nowLiked = await toggleLike(post.id, user.id)
    setLiked(nowLiked)
    setLikeCount(c => c + (nowLiked ? 1 : -1))
  }

  const handleSave = async () => {
    if (!user) return
    const nowSaved = await toggleSave(post.id, user.id)
    setSaved(nowSaved)
  }

  const handleCopy = async () => {
    await copyPostLink(post.id)
    toast('Link copied!')
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
        <button className="modal-close-btn" onClick={onClose}>&times;</button>
        <div className="post-detail">
          <img className="post-detail-image" src={post.image_url} alt={post.title} />
          <div className="post-detail-body">
            <div className="post-detail-creator">
              {profile.avatar_url
                ? <img className="post-detail-avatar" src={profile.avatar_url} alt="" />
                : <div className="post-detail-avatar" />}
              <div>
                <div className="post-detail-name">
                  <a href={`./user.html?u=${profile.username || ''}`}>
                    {profile.display_name || profile.username || 'Anonymous'}
                  </a>
                </div>
                {post.location_name && <div className="card-location">{post.location_name}</div>}
              </div>
            </div>

            <h2 className="post-detail-title">{post.title}</h2>
            {post.description && <p className="post-detail-desc">{post.description}</p>}

            <div className="post-actions">
              <button className={`btn btn-sm ${liked ? 'btn-primary' : 'btn-secondary'}`} onClick={handleLike}>
                &#9829; {likeCount}
              </button>
              <button className={`btn btn-sm ${saved ? 'btn-primary' : 'btn-secondary'}`} onClick={handleSave}>
                &#9733; {saved ? 'Saved' : 'Save'}
              </button>

              {post.saved_view_id && (
                <a
                  href={`./poster-v3-ui.html?view=${post.saved_view_id}`}
                  className="btn btn-sm btn-secondary"
                >
                  Use this view
                </a>
              )}

              <div className="share-buttons">
                <button className="btn btn-sm btn-ghost" onClick={handleCopy} title="Copy link">
                  &#128279; Copy link
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => shareToTwitter(post)} title="Share on Twitter">
                  𝕏
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => shareToFacebook(post)} title="Share on Facebook">
                  f
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main App ───
function App() {
  const { user } = useAuth()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState('newest')
  const [selectedPost, setSelectedPost] = useState(null)
  const [likedSet, setLikedSet] = useState(new Set())
  const [savedSet, setSavedSet] = useState(new Set())
  const [toastMsg, setToastMsg] = useState('')

  const showToast = useCallback((msg) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 2000)
  }, [])

  // Check URL for ?post=ID deep link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const postId = params.get('post')
    if (postId) {
      fetchPost(postId).then(setSelectedPost).catch(() => {})
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchPosts({ sort })
      .then(data => {
        setPosts(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [sort])

  // Batch check liked/saved status
  useEffect(() => {
    if (!user || posts.length === 0) return
    Promise.all(posts.map(p => checkLiked(p.id, user.id))).then(results => {
      const s = new Set()
      results.forEach((liked, i) => { if (liked) s.add(posts[i].id) })
      setLikedSet(s)
    })
    Promise.all(posts.map(p => checkSaved(p.id, user.id))).then(results => {
      const s = new Set()
      results.forEach((saved, i) => { if (saved) s.add(posts[i].id) })
      setSavedSet(s)
    })
  }, [user, posts])

  const handleLike = async (postId) => {
    if (!user) return
    const nowLiked = await toggleLike(postId, user.id)
    setLikedSet(prev => {
      const next = new Set(prev)
      nowLiked ? next.add(postId) : next.delete(postId)
      return next
    })
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, like_count: (p.like_count || 0) + (nowLiked ? 1 : -1) } : p
    ))
  }

  const handleSave = async (postId) => {
    if (!user) return
    const nowSaved = await toggleSave(postId, user.id)
    setSavedSet(prev => {
      const next = new Set(prev)
      nowSaved ? next.add(postId) : next.delete(postId)
      return next
    })
  }

  const sortOptions = [
    { key: 'newest', label: 'Newest' },
    { key: 'trending', label: 'Trending' },
    { key: 'most_liked', label: 'Most Liked' },
  ]

  return (
    <>
      <Navbar />
      <main className="container" style={{ paddingTop: 84 }}>
        <FadeIn>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(28px, 4vw, 38px)', fontWeight: 400, letterSpacing: '-0.02em', marginBottom: 6 }}>
              Community Gallery
            </h1>
            <p style={{ color: 'var(--ink-soft)', fontSize: 16 }}>
              Discover stunning map posters created by people around the world
            </p>
          </div>
        </FadeIn>

        <div className="toolbar">
          <div className="sort-tabs">
            {sortOptions.map(o => (
              <button
                key={o.key}
                className={`sort-tab ${sort === o.key ? 'active' : ''}`}
                onClick={() => setSort(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <a href="./poster-v3-ui.html" className="btn btn-primary btn-sm">
            + Share your creation
          </a>
        </div>

        {loading ? (
          <div className="spinner" />
        ) : posts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🗺️</div>
            <h3>No posts yet</h3>
            <p>Be the first to share a creation!</p>
            <a href="./poster-v3-ui.html" className="btn btn-primary" style={{ marginTop: 16 }}>
              Open the Editor
            </a>
          </div>
        ) : (
          <div className="gallery-masonry">
            {posts.map((post, i) => (
              <FadeIn key={post.id} delay={i * 40}>
                <PostCard
                  post={post}
                  onClick={setSelectedPost}
                  onLike={handleLike}
                  onSave={handleSave}
                  liked={likedSet.has(post.id)}
                  saved={savedSet.has(post.id)}
                />
              </FadeIn>
            ))}
          </div>
        )}
      </main>

      {selectedPost && (
        <PostDetail
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          user={user}
          toast={showToast}
        />
      )}

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-col">
            <h4>MapPoster</h4>
            <a href="/src/">Home</a>
            <a href="./poster-v3-ui.html">Editor</a>
            <a href="./community.html">Community</a>
            <a href="./pricing.html">Pricing</a>
          </div>
          <div className="footer-col">
            <h4>Legal</h4>
            <a href="#">Terms of Service</a>
            <a href="#">Privacy Policy</a>
          </div>
        </div>
        <div className="footer-bottom container">
          Made with &#9829; and Google 3D Tiles
        </div>
      </footer>

      <Toast message={toastMsg} />
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
