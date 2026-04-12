import React, { useState, useEffect, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './lib/supabase.js'
import { useAuth } from './lib/useAuth.js'

// ─── Helpers ───
function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago'
  return new Date(ts).toLocaleDateString()
}

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

// ─── Data fetching ───
async function fetchStats() {
  const [users, posts, likes, saves, views] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('community_posts').select('id', { count: 'exact', head: true }),
    supabase.from('likes').select('id', { count: 'exact', head: true }),
    supabase.from('saves').select('id', { count: 'exact', head: true }),
    supabase.from('saved_views').select('id', { count: 'exact', head: true }),
  ])

  // Counts from last 7 days
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const [newUsers, newPosts, newLikes] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    supabase.from('community_posts').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    supabase.from('likes').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
  ])

  return {
    totalUsers: users.count || 0,
    totalPosts: posts.count || 0,
    totalLikes: likes.count || 0,
    totalSaves: saves.count || 0,
    totalViews: views.count || 0,
    newUsersWeek: newUsers.count || 0,
    newPostsWeek: newPosts.count || 0,
    newLikesWeek: newLikes.count || 0,
  }
}

async function fetchRecentUsers(limit = 10) {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

async function fetchTopPosts(limit = 10) {
  const { data } = await supabase
    .from('community_posts')
    .select('*, profiles(username, display_name, avatar_url)')
    .order('likes_count', { ascending: false })
    .limit(limit)
  return data || []
}

async function fetchRecentPosts(limit = 10) {
  const { data } = await supabase
    .from('community_posts')
    .select('*, profiles(username, display_name, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

async function fetchSignupsByDay() {
  const days = 7
  const result = []
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - i)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)

    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())

    const label = start.toLocaleDateString('en-US', { weekday: 'short' })
    result.push({ label, count: count || 0 })
  }
  return result
}

// ─── Components ───
function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{formatNum(value)}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  )
}

function BarChart({ data, title }) {
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="admin-section">
      <h2>{title}</h2>
      <div className="chart-placeholder">
        {data.map((d, i) => (
          <div className="chart-bar-row" key={i}>
            <div className="chart-bar-label">{d.label}</div>
            <div className="chart-bar-track">
              <div className="chart-bar-fill" style={{ width: `${(d.count / max) * 100}%` }} />
            </div>
            <div className="chart-bar-value">{d.count}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function UsersTable({ users }) {
  if (!users.length) {
    return (
      <div className="admin-empty">
        <div className="admin-empty-icon">👤</div>
        <div>No users yet — connect Supabase to see data</div>
      </div>
    )
  }
  return (
    <div className="table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Username</th>
            <th>Joined</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>
                <div className="avatar-cell">
                  {u.avatar_url
                    ? <img className="mini-avatar" src={u.avatar_url} alt="" />
                    : <div className="mini-avatar" />}
                  <span style={{ color: 'var(--ink)' }}>{u.display_name || 'Anonymous'}</span>
                </div>
              </td>
              <td style={{ color: 'var(--ink-dim)', fontSize: 13 }}>@{u.username || '—'}</td>
              <td>{timeAgo(u.created_at)}</td>
              <td>
                {Date.now() - new Date(u.created_at).getTime() < 86400000 * 7
                  ? <span className="admin-badge new">New</span>
                  : <span className="admin-badge active">Active</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PostsTable({ posts, title }) {
  if (!posts.length) {
    return (
      <div className="admin-empty">
        <div className="admin-empty-icon">🗺️</div>
        <div>No posts yet — connect Supabase to see data</div>
      </div>
    )
  }
  return (
    <div className="table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Post</th>
            <th>Creator</th>
            <th>Location</th>
            <th>Likes</th>
            <th>Saves</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {posts.map(p => {
            const profile = p.profiles || {}
            return (
              <tr key={p.id}>
                <td>
                  <div className="avatar-cell">
                    {p.thumbnail_url || p.image_url
                      ? <img className="mini-avatar" src={p.thumbnail_url || p.image_url} alt="" style={{ borderRadius: 6 }} />
                      : <div className="mini-avatar" style={{ borderRadius: 6 }} />}
                    <span style={{ color: 'var(--ink)' }}>{p.title}</span>
                  </div>
                </td>
                <td style={{ fontSize: 13 }}>
                  <a href={`./user.html?u=${profile.username}`} style={{ color: 'var(--accent)' }}>
                    @{profile.username || '—'}
                  </a>
                </td>
                <td style={{ color: 'var(--ink-dim)', fontSize: 13 }}>{p.location_name || '—'}</td>
                <td style={{ color: 'var(--ink-soft)' }}>{p.likes_count || 0}</td>
                <td style={{ color: 'var(--ink-soft)' }}>{p.saves_count || 0}</td>
                <td>{timeAgo(p.created_at)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── App ───
function AdminDashboard() {
  const { user, loading: authLoading } = useAuth()
  const [stats, setStats] = useState(null)
  const [recentUsers, setRecentUsers] = useState([])
  const [topPosts, setTopPosts] = useState([])
  const [recentPosts, setRecentPosts] = useState([])
  const [signups, setSignups] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)

  const loadData = useCallback(async () => {
    try {
      const [s, ru, tp, rp, sd] = await Promise.all([
        fetchStats(),
        fetchRecentUsers(),
        fetchTopPosts(),
        fetchRecentPosts(),
        fetchSignupsByDay(),
      ])
      setStats(s)
      setRecentUsers(ru)
      setTopPosts(tp)
      setRecentPosts(rp)
      setSignups(sd)
      setLastRefresh(new Date())
    } catch (e) {
      console.error('Admin fetch error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleRefresh = () => {
    setRefreshing(true)
    loadData()
  }

  if (authLoading || loading) {
    return (
      <main className="container" style={{ paddingTop: 100 }}>
        <div className="spinner" />
      </main>
    )
  }

  return (
    <main className="container" style={{ paddingTop: 84, paddingBottom: 60 }}>
      <div className="admin-header">
        <div>
          <h1>Admin Dashboard</h1>
          <div className="admin-header-sub">
            {lastRefresh && `Last updated ${lastRefresh.toLocaleTimeString()}`}
          </div>
        </div>
        <button className={`refresh-btn ${refreshing ? 'spinning' : ''}`} onClick={handleRefresh}>
          <span className="refresh-icon">↻</span>
          Refresh
        </button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="admin-grid">
          <StatCard
            label="Total Users"
            value={stats.totalUsers}
            sub={<><span className="up">+{stats.newUsersWeek}</span> this week</>}
          />
          <StatCard
            label="Community Posts"
            value={stats.totalPosts}
            sub={<><span className="up">+{stats.newPostsWeek}</span> this week</>}
          />
          <StatCard
            label="Total Likes"
            value={stats.totalLikes}
            sub={<><span className="up">+{stats.newLikesWeek}</span> this week</>}
          />
          <StatCard
            label="Saved Views"
            value={stats.totalViews}
          />
        </div>
      )}

      {/* Signups chart */}
      <BarChart data={signups} title="Signups — Last 7 days" />

      {/* Recent users */}
      <div className="admin-section">
        <h2>Recent Signups</h2>
        <UsersTable users={recentUsers} />
      </div>

      {/* Top posts */}
      <div className="admin-section">
        <h2>Top Posts (by likes)</h2>
        <PostsTable posts={topPosts} title="Top Posts" />
      </div>

      {/* Recent posts */}
      <div className="admin-section">
        <h2>Recent Posts</h2>
        <PostsTable posts={recentPosts} title="Recent Posts" />
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<AdminDashboard />)
