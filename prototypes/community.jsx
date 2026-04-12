import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { useAuth } from './lib/useAuth.js'
import {
  fetchPosts, fetchPost, toggleLike, toggleSave, checkLiked, checkSaved,
  shareToTwitter, shareToFacebook, copyPostLink, getPostUrl,
  getUnreadCount, fetchNotifications, markNotificationsRead,
  fetchCollections, createCollection, addToCollection, removeFromCollection,
  fetchCollectionPosts, deleteCollection,
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

// ─── Notification Bell ───
function NotificationBell({ user }) {
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const ref = useRef(null)

  useEffect(() => {
    if (!user) return
    getUnreadCount(user.id).then(setUnread)
    const interval = setInterval(() => getUnreadCount(user.id).then(setUnread), 30000)
    return () => clearInterval(interval)
  }, [user])

  useEffect(() => {
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const handleOpen = async () => {
    if (!open) {
      const notifs = await fetchNotifications(user.id)
      setNotifications(notifs)
      if (unread > 0) {
        await markNotificationsRead(user.id)
        setUnread(0)
      }
    }
    setOpen(!open)
  }

  const formatTime = (ts) => {
    const d = new Date(ts)
    const diff = Date.now() - d.getTime()
    if (diff < 60000) return 'now'
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm'
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h'
    return Math.floor(diff / 86400000) + 'd'
  }

  if (!user) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={handleOpen}
        style={{
          background: 'none', border: 'none', color: 'var(--ink-soft)',
          fontSize: 18, cursor: 'pointer', position: 'relative', padding: '4px 8px',
        }}
        title="Notifications"
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 2, minWidth: 16, height: 16,
            borderRadius: 8, background: '#e55353', color: '#fff',
            fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '0 4px',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, width: 300,
          background: 'var(--bg-1)', border: '1px solid var(--panel-border)',
          borderRadius: 'var(--radius)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          maxHeight: 360, overflowY: 'auto', zIndex: 200,
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--panel-border)', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
            Notifications
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ink-dim)', fontSize: 13 }}>
              No notifications yet
            </div>
          ) : (
            notifications.slice(0, 15).map(n => (
              <div key={n.id} style={{
                padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)',
                fontSize: 13, color: n.is_read ? 'var(--ink-dim)' : 'var(--ink)',
                display: 'flex', justifyContent: 'space-between', gap: 8,
              }}>
                <span>{n.message || 'New activity'}</span>
                <span style={{ color: 'var(--ink-dim)', fontSize: 11, flexShrink: 0 }}>{formatTime(n.created_at)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Navbar ───
function Navbar({ user }) {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <a href="/src/" className="nav-logo">MapPoster</a>
        <div className="nav-links">
          <a href="./community.html" style={{ color: 'var(--ink)' }}>Community</a>
          <a href="./pricing.html">Pricing</a>
          <NotificationBell user={user} />
          <a href="./poster-v3-ui.html" className="btn btn-primary btn-sm">Create</a>
        </div>
      </div>
    </nav>
  )
}

// ─── Post Card ───
function BlurUpImage({ src, alt, className }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <img
        className={className}
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        style={{
          filter: loaded ? 'blur(0)' : 'blur(12px)',
          transform: loaded ? 'scale(1)' : 'scale(1.05)',
          transition: 'filter 0.5s ease, transform 0.5s ease',
        }}
      />
    </div>
  )
}

function PostCard({ post, onClick, onLike, onSave, liked, saved }) {
  const profile = post.profiles || {}
  return (
    <div className="card" onClick={() => onClick(post)}>
      <div className="card-image-wrap">
        <BlurUpImage className="card-image" src={post.image_url} alt={post.title} />
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

// ─── Collection Picker ───
function CollectionPicker({ postId, user, toast }) {
  const [open, setOpen] = useState(false)
  const [collections, setCollections] = useState([])
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const loadCollections = useCallback(async () => {
    if (!user) return
    const cols = await fetchCollections(user.id)
    setCollections(cols)
  }, [user])

  useEffect(() => { if (open) loadCollections() }, [open, loadCollections])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const col = await createCollection(user.id, newName.trim())
      await addToCollection(col.id, postId)
      toast(`Added to "${col.name}"`)
      setNewName('')
      loadCollections()
    } catch (e) {
      toast('Failed to create collection')
    }
    setCreating(false)
  }

  const handleAdd = async (col) => {
    try {
      await addToCollection(col.id, postId)
      toast(`Added to "${col.name}"`)
      loadCollections()
    } catch (e) {
      toast('Already in collection')
    }
  }

  if (!user) return null

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn btn-sm btn-secondary" onClick={() => setOpen(o => !o)}>
        &#128193; Collect
      </button>
      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, width: 260,
          background: 'var(--bg-1)', border: '1px solid var(--panel-border)',
          borderRadius: 'var(--radius)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 300, overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--panel-border)', fontWeight: 500, fontSize: 13 }}>
            Add to collection
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {collections.length === 0 ? (
              <div style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--ink-dim)', fontSize: 13 }}>
                No collections yet
              </div>
            ) : (
              collections.map(col => (
                <button
                  key={col.id}
                  onClick={() => handleAdd(col)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '10px 14px', background: 'none', border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.03)', color: 'var(--ink)',
                    cursor: 'pointer', fontSize: 13, fontFamily: 'var(--body)', textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseOut={e => e.currentTarget.style.background = 'none'}
                >
                  <span>{col.name}</span>
                  <span style={{ color: 'var(--ink-dim)', fontSize: 11 }}>{col.item_count} items</span>
                </button>
              ))
            )}
          </div>
          <div style={{
            padding: '10px 14px', borderTop: '1px solid var(--panel-border)',
            display: 'flex', gap: 6,
          }}>
            <input
              type="text"
              placeholder="New collection..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              style={{
                flex: 1, padding: '6px 10px', background: 'var(--bg-0)',
                border: '1px solid var(--panel-border)', borderRadius: 'var(--radius)',
                color: 'var(--ink)', fontFamily: 'var(--body)', fontSize: 12, outline: 'none',
              }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              style={{ padding: '6px 10px', fontSize: 12 }}
            >+</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── My Collections View ───
function CollectionsView({ user, toast, onSelectPost }) {
  const [collections, setCollections] = useState([])
  const [selectedCol, setSelectedCol] = useState(null)
  const [colPosts, setColPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    fetchCollections(user.id).then(cols => {
      setCollections(cols)
      setLoading(false)
    })
  }, [user])

  const handleSelectCol = async (col) => {
    setSelectedCol(col)
    setLoading(true)
    const posts = await fetchCollectionPosts(col.id)
    setColPosts(posts)
    setLoading(false)
  }

  const handleDeleteCol = async (colId) => {
    await deleteCollection(colId)
    setCollections(prev => prev.filter(c => c.id !== colId))
    if (selectedCol?.id === colId) { setSelectedCol(null); setColPosts([]) }
    toast('Collection deleted')
  }

  const handleRemovePost = async (postId) => {
    if (!selectedCol) return
    await removeFromCollection(selectedCol.id, postId)
    setColPosts(prev => prev.filter(p => p.id !== postId))
    toast('Removed from collection')
  }

  if (!user) {
    return (
      <div className="admin-empty" style={{ padding: '60px 24px' }}>
        <div style={{ fontSize: 40, opacity: 0.3, marginBottom: 12 }}>&#128193;</div>
        <div style={{ color: 'var(--ink-soft)', fontSize: 15 }}>Sign in to create collections</div>
      </div>
    )
  }

  if (loading) return <div className="spinner" />

  if (selectedCol) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedCol(null); setColPosts([]) }}>
            &larr; Back
          </button>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 400 }}>{selectedCol.name}</h2>
          <span style={{ color: 'var(--ink-dim)', fontSize: 13 }}>{colPosts.length} posts</span>
        </div>
        {colPosts.length === 0 ? (
          <div className="admin-empty">
            <div style={{ fontSize: 40, opacity: 0.3, marginBottom: 12 }}>&#128193;</div>
            <div>This collection is empty</div>
          </div>
        ) : (
          <div className="gallery-masonry">
            {colPosts.map(post => (
              <div key={post.id} className="card" style={{ cursor: 'pointer', position: 'relative' }}>
                <div className="card-image-wrap" onClick={() => onSelectPost(post)}>
                  <img className="card-image" src={post.image_url} alt={post.title} loading="lazy" />
                </div>
                <div className="card-body">
                  <div className="card-title">{post.title}</div>
                  {post.location_name && <div className="card-location">{post.location_name}</div>}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}
                    onClick={() => handleRemovePost(post.id)}
                  >Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {collections.length === 0 ? (
        <div className="admin-empty" style={{ padding: '60px 24px' }}>
          <div style={{ fontSize: 40, opacity: 0.3, marginBottom: 12 }}>&#128193;</div>
          <div style={{ color: 'var(--ink-soft)', fontSize: 15, marginBottom: 8 }}>No collections yet</div>
          <div style={{ color: 'var(--ink-dim)', fontSize: 13 }}>
            Open a post and click "Collect" to start organizing
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {collections.map(col => (
            <div key={col.id} className="card" style={{ cursor: 'pointer' }}>
              <div style={{ padding: 20 }} onClick={() => handleSelectCol(col)}>
                <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.4 }}>&#128193;</div>
                <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>{col.name}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-dim)' }}>{col.item_count} post{col.item_count !== 1 ? 's' : ''}</div>
                {col.description && <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 8 }}>{col.description}</div>}
              </div>
              <div style={{ padding: '8px 20px 16px', borderTop: '1px solid var(--panel-border)' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 12, color: 'var(--danger)' }}
                  onClick={(e) => { e.stopPropagation(); handleDeleteCol(col.id) }}
                >Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
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
              <CollectionPicker postId={post.id} user={user} toast={toast} />

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

// ─── Search Panel ───
function SearchPanel({ filters, onFilterChange, onSearch, onClear, resultCount, hasFilters }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="search-panel" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg-1)', border: '1px solid var(--panel-border)',
          borderRadius: 'var(--radius)', padding: '0 14px', transition: 'border-color 0.2s',
        }}>
          <span style={{ color: 'var(--ink-dim)', fontSize: 16, flexShrink: 0 }}>&#128269;</span>
          <input
            type="text"
            placeholder="Search posters..."
            value={filters.search}
            onChange={e => onFilterChange('search', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSearch()}
            style={{
              flex: 1, background: 'none', border: 'none', color: 'var(--ink)',
              fontFamily: 'var(--body)', fontSize: 14, padding: '10px 0', outline: 'none',
            }}
          />
          {filters.search && (
            <button
              onClick={() => { onFilterChange('search', ''); onSearch() }}
              style={{
                background: 'none', border: 'none', color: 'var(--ink-dim)',
                cursor: 'pointer', fontSize: 16, padding: '2px 4px',
              }}
            >&times;</button>
          )}
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="btn btn-secondary btn-sm"
          style={{ position: 'relative' }}
        >
          &#9776; Filters
          {hasFilters && (
            <span style={{
              position: 'absolute', top: -4, right: -4, width: 8, height: 8,
              borderRadius: '50%', background: 'var(--accent)',
            }} />
          )}
        </button>
        <button className="btn btn-primary btn-sm" onClick={onSearch}>Search</button>
      </div>

      {expanded && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12, marginTop: 12, padding: 16, background: 'var(--bg-1)',
          border: '1px solid var(--panel-border)', borderRadius: 'var(--radius)',
        }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-dim)', marginBottom: 6 }}>
              Location
            </label>
            <input
              type="text"
              placeholder="e.g. Tokyo, Paris..."
              value={filters.location}
              onChange={e => onFilterChange('location', e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', background: 'var(--bg-0)',
                border: '1px solid var(--panel-border)', borderRadius: 'var(--radius)',
                color: 'var(--ink)', fontFamily: 'var(--body)', fontSize: 13, outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-dim)', marginBottom: 6 }}>
              Creator
            </label>
            <input
              type="text"
              placeholder="Username or name..."
              value={filters.creator}
              onChange={e => onFilterChange('creator', e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', background: 'var(--bg-0)',
                border: '1px solid var(--panel-border)', borderRadius: 'var(--radius)',
                color: 'var(--ink)', fontFamily: 'var(--body)', fontSize: 13, outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-dim)', marginBottom: 6 }}>
              From
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={e => onFilterChange('dateFrom', e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', background: 'var(--bg-0)',
                border: '1px solid var(--panel-border)', borderRadius: 'var(--radius)',
                color: 'var(--ink)', fontFamily: 'var(--body)', fontSize: 13, outline: 'none',
                colorScheme: 'dark',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-dim)', marginBottom: 6 }}>
              To
            </label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={e => onFilterChange('dateTo', e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', background: 'var(--bg-0)',
                border: '1px solid var(--panel-border)', borderRadius: 'var(--radius)',
                color: 'var(--ink)', fontFamily: 'var(--body)', fontSize: 13, outline: 'none',
                colorScheme: 'dark',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClear}>Clear all</button>
          </div>
        </div>
      )}

      {hasFilters && !expanded && (
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-dim)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Showing {resultCount} result{resultCount !== 1 ? 's' : ''}</span>
          <button
            onClick={onClear}
            style={{
              background: 'none', border: 'none', color: 'var(--accent)',
              cursor: 'pointer', fontSize: 13, fontFamily: 'var(--body)',
            }}
          >Clear filters</button>
        </div>
      )}
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
  const [tab, setTab] = useState('gallery') // 'gallery' | 'collections'
  const [filters, setFilters] = useState({ search: '', location: '', creator: '', dateFrom: '', dateTo: '' })
  const [activeFilters, setActiveFilters] = useState({ search: '', location: '', creator: '', dateFrom: '', dateTo: '' })

  const hasFilters = Object.values(activeFilters).some(v => v !== '')

  const showToast = useCallback((msg) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 2000)
  }, [])

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleSearch = useCallback(() => {
    setActiveFilters({ ...filters })
  }, [filters])

  const handleClearFilters = useCallback(() => {
    const empty = { search: '', location: '', creator: '', dateFrom: '', dateTo: '' }
    setFilters(empty)
    setActiveFilters(empty)
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
    fetchPosts({ sort, ...activeFilters })
      .then(data => {
        setPosts(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [sort, activeFilters])

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
      <Navbar user={user} />
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

        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          <button
            className={`sort-tab ${tab === 'gallery' ? 'active' : ''}`}
            onClick={() => setTab('gallery')}
            style={{ fontSize: 14 }}
          >Gallery</button>
          <button
            className={`sort-tab ${tab === 'collections' ? 'active' : ''}`}
            onClick={() => setTab('collections')}
            style={{ fontSize: 14 }}
          >&#128193; My Collections</button>
        </div>

        {tab === 'collections' ? (
          <CollectionsView user={user} toast={showToast} onSelectPost={setSelectedPost} />
        ) : (
        <>
        <SearchPanel
          filters={filters}
          onFilterChange={handleFilterChange}
          onSearch={handleSearch}
          onClear={handleClearFilters}
          resultCount={posts.length}
          hasFilters={hasFilters}
        />

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
          <div style={{ padding: '80px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(200,184,151,0.12), rgba(200,184,151,0.04))',
              border: '1px solid rgba(200,184,151,0.15)', marginBottom: 24, fontSize: 36,
            }}>🗺️</div>
            <h3 style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 400, color: 'var(--ink)', marginBottom: 8 }}>No posts yet</h3>
            <p style={{ color: 'var(--ink-soft)', fontSize: 15, maxWidth: 360, lineHeight: 1.6, marginBottom: 24 }}>
              Be the first to share a map poster with the community
            </p>
            <a href="./poster-v3-ui.html" className="btn btn-primary">
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
        </>
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
