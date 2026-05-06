import { useEffect, useState, useRef } from 'react'
import { useAtom } from 'jotai'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { friendlyError } from '../lib/errors'
import AuthInput from '../components/auth/AuthInput'
import AuthButton from '../components/auth/AuthButton'
import { aiApiKeyAtom } from './editor/atoms/sidebar'
import { getTier, getTierLimits } from '../lib/entitlements'
import { getRenderCount } from '../lib/renderCount'
import { loadGalleryEntries } from './editor/utils/galleryDb'

const s = {
  page: {
    minHeight: '100vh', background: '#09090b', padding: '40px 24px',
    fontFamily: "'Inter', system-ui, sans-serif", color: '#e8e4dc',
  },
  container: { maxWidth: 480, margin: '0 auto' },
  heading: {
    fontFamily: "'Fraunces', 'Playfair Display', Georgia, serif",
    fontSize: 28, fontWeight: 500, marginBottom: 32, letterSpacing: '0.01em',
  },
  avatarRow: {
    display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32,
  },
  avatar: {
    width: 80, height: 80, borderRadius: '50%', background: '#151518',
    border: '2px solid rgba(255,255,255,0.06)', objectFit: 'cover',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 28, color: '#5a5750', overflow: 'hidden',
  },
  uploadBtn: {
    padding: '8px 16px', background: '#151518',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
    color: '#8a8780', fontSize: 13, cursor: 'pointer',
  },
  success: {
    color: '#6ecf6e', fontSize: 13, textAlign: 'center', marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em',
    color: 'rgba(232,228,220,0.5)', marginBottom: 12, marginTop: 32,
  },
  card: {
    background: '#151518', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12, padding: 18,
  },
  tierRow: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    marginBottom: 12,
  },
  tierName: { fontSize: 16, fontWeight: 600 },
  tierBadge: {
    fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em',
    padding: '4px 8px', borderRadius: 999,
    background: 'rgba(200,184,151,0.14)', color: '#c8b897',
    border: '1px solid rgba(200,184,151,0.42)',
  },
  meterTrack: {
    width: '100%', height: 4, borderRadius: 999, overflow: 'hidden',
    background: 'rgba(255,255,255,0.06)', marginTop: 8,
  },
  meterFill: { height: '100%', background: '#c8b897', borderRadius: 999 },
  meterText: {
    fontSize: 12, color: '#8a8780', marginTop: 8, fontVariantNumeric: 'tabular-nums',
  },
  byokInput: {
    width: '100%', padding: '10px 14px',
    background: '#0e0d11', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, color: '#e8e4dc', fontSize: 13,
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    outline: 'none', letterSpacing: '0.02em',
  },
  byokHint: {
    fontSize: 12, color: '#8a8780', marginTop: 8, lineHeight: 1.4,
  },
  postersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 8,
  },
  posterCard: {
    aspectRatio: '4 / 3',
    borderRadius: 6,
    overflow: 'hidden',
    background: '#0c0a08',
    border: '1px solid rgba(255,255,255,0.06)',
    cursor: 'pointer',
    padding: 0,
    display: 'block',
    fontFamily: 'inherit',
  },
  posterImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  postersEmpty: {
    fontSize: 13, color: '#8a8780', textAlign: 'center', padding: '24px 0',
  },
  upgradeBtn: {
    marginTop: 12, padding: '10px 18px',
    background: '#c8b897', color: '#0c0a08',
    border: 'none', borderRadius: 8,
    fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
    cursor: 'pointer', fontFamily: 'inherit',
  },
}

// Phase 7.1 — when localStorage holds the BYOK key (set from the AI render
// modal), the atom is hydrated from there at module load. Profile reads
// the same atom so the two surfaces stay in sync.
const LS_GEMINI_KEY = 'vedute_gemini_key'

export default function ProfilePage() {
  const { profile, user, updateProfile, uploadAvatar } = useAuth()
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [bio, setBio] = useState(profile?.bio || '')

  // Profile loads async after AuthContext mounts. If this page rendered
  // before loadProfile resolved, displayName/bio initialized to '' and
  // stayed there forever — the Edit form would show empty inputs even
  // though profile had a name. Sync on profile change so the form
  // tracks the source of truth.
  useEffect(() => {
    if (profile?.display_name != null) setDisplayName(profile.display_name)
    if (profile?.bio != null) setBio(profile.bio)
  }, [profile?.display_name, profile?.bio])
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const fileRef = useRef(null)

  const [aiKey, setAiKey] = useAtom(aiApiKeyAtom)
  const [renderCount, setRenderCount] = useState(0)
  const [posters, setPosters] = useState([])
  useEffect(() => {
    setRenderCount(getRenderCount())
    // Refresh on focus so the count updates after the user renders something
    // and comes back to this tab.
    const onFocus = () => setRenderCount(getRenderCount())
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // Load the user's local gallery for the My posters grid. (Once Phase 7.1
  // wires Supabase gallery_entries, swap loadGalleryEntries for a server
  // query keyed on auth.uid().)
  useEffect(() => {
    loadGalleryEntries().then((items) => {
      setPosters(items.slice().reverse())
    })
  }, [])

  const handleUpgrade = async () => {
    // TODO Phase 6.2 — POST to /api/stripe-checkout and redirect to the
    // returned session URL. Today the endpoint returns 501.
    const toast = (type, message) =>
      window.dispatchEvent(new CustomEvent('toast', { detail: { type, message } }))
    try {
      const r = await fetch('/api/stripe-checkout', { method: 'POST' })
      const data = await r.json().catch(() => ({}))
      if (data?.url) {
        window.location.href = data.url
        return
      }
      toast('info', data?.message || 'Upgrade not yet available.')
    } catch {
      toast('error', 'Upgrade endpoint unreachable.')
    }
  }

  // Hydrate the BYOK atom from localStorage on mount (mirrors AI render modal
  // behavior) so the input shows whatever the user already set there.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_GEMINI_KEY) || ''
      if (stored && !aiKey) setAiKey(stored)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleByokChange = (e) => {
    const v = e.target.value
    setAiKey(v)
    try {
      if (v) localStorage.setItem(LS_GEMINI_KEY, v)
      else localStorage.removeItem(LS_GEMINI_KEY)
    } catch {}
  }

  const tier = getTier(profile)
  const limits = getTierLimits(profile)
  const monthly = limits.rendersPerMonth
  const isUnlimited = !Number.isFinite(monthly)
  const meterPct = isUnlimited
    ? 0
    : Math.min(100, Math.round((renderCount / monthly) * 100))

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    // Basic client-side validation. Without these the user could save
    // a 10000-char display_name that breaks the Navbar layout, or an
    // empty-string display_name that renders as nothing in the
    // dropdown header.
    const trimmedName = displayName.trim()
    if (!trimmedName) {
      setError('Display name is required.')
      return
    }
    if (trimmedName.length > 50) {
      setError('Display name is too long — keep it under 50 characters.')
      return
    }
    if (bio.length > 500) {
      setError('Bio is too long — keep it under 500 characters.')
      return
    }
    setLoading(true)
    try {
      await updateProfile({ display_name: trimmedName, bio })
      setSuccess('Profile updated')
      setEditing(false)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      await uploadAvatar(file)
      setSuccess('Avatar updated')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setUploading(false)
    }
  }

  const initials = (profile?.display_name || profile?.username || user?.email || '?')[0].toUpperCase()

  return (
    <div style={s.page}>
      <div style={s.container}>
        <h1 style={s.heading}>Profile</h1>

        <div style={s.avatarRow}>
          <div style={s.avatar}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initials}
          </div>
          <div>
            <button style={s.uploadBtn} onClick={() => fileRef.current?.click()}>
              {uploading ? 'Uploading...' : 'Change avatar'}
            </button>
            <input
              ref={fileRef} type="file" accept="image/*"
              style={{ display: 'none' }} onChange={handleAvatarChange}
            />
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: '#5a5750', marginBottom: 4 }}>Username</div>
          <div style={{ fontSize: 15, color: '#8a8780' }}>{profile?.username || '—'}</div>
        </div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: '#5a5750', marginBottom: 4 }}>Email</div>
          <div style={{ fontSize: 15, color: '#8a8780' }}>{user?.email || '—'}</div>
        </div>

        {editing ? (
          <form onSubmit={handleSave}>
            <AuthInput
              label="Display name" type="text"
              value={displayName} onChange={e => setDisplayName(e.target.value)}
            />
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#8a8780', marginBottom: 6 }}>Bio</label>
              <textarea
                value={bio} onChange={e => setBio(e.target.value)}
                rows={3}
                style={{
                  width: '100%', padding: '10px 14px',
                  background: '#151518', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8, color: '#e8e4dc', fontSize: 14, resize: 'vertical',
                  fontFamily: "'Inter', system-ui, sans-serif", outline: 'none',
                }}
              />
            </div>
            {error && <p style={{ color: '#e55353', fontSize: 13, marginBottom: 16 }}>{error}</p>}
            {success && <p style={s.success}>{success}</p>}
            <div style={{ display: 'flex', gap: 12 }}>
              <AuthButton loading={loading}>Save</AuthButton>
              <button
                type="button" onClick={() => setEditing(false)}
                style={{ ...s.uploadBtn, flex: 1, textAlign: 'center' }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: '#5a5750', marginBottom: 4 }}>Display name</div>
              <div style={{ fontSize: 15, color: '#e8e4dc' }}>{profile?.display_name || '—'}</div>
            </div>
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 13, color: '#5a5750', marginBottom: 4 }}>Bio</div>
              <div style={{ fontSize: 15, color: '#e8e4dc', whiteSpace: 'pre-wrap' }}>
                {profile?.bio || '—'}
              </div>
            </div>
            {error && <p style={{ color: '#e55353', fontSize: 13, marginBottom: 16 }}>{error}</p>}
            {success && <p style={s.success}>{success}</p>}
            <button
              onClick={() => { setEditing(true); setSuccess('') }}
              style={{
                padding: '12px 24px', background: '#c8b897', color: '#09090b',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Edit profile
            </button>
          </>
        )}

        {/* Phase 7.1 — Vedute-specific account state. */}
        <div style={s.sectionLabel}>Plan</div>
        <div style={s.card}>
          <div style={s.tierRow}>
            <div style={s.tierName}>{limits.label}</div>
            <div style={s.tierBadge}>{tier === 'pro' ? 'Pro' : 'Free'}</div>
          </div>
          <div style={s.meterTrack}>
            <div
              style={{
                ...s.meterFill,
                width: isUnlimited ? '100%' : `${meterPct}%`,
                opacity: isUnlimited ? 0.4 : 1,
              }}
            />
          </div>
          <div style={s.meterText}>
            {isUnlimited
              ? `Unlimited renders this month — ${renderCount} used`
              : `${renderCount} of ${monthly} AI renders used this month${aiKey ? ' (BYOK bypasses this limit)' : ''}`}
          </div>
          {tier !== 'pro' && (
            <>
              <div style={{ ...s.byokHint, marginTop: 16 }}>
                Or set your own Gemini key below to skip the limit entirely.
              </div>
              <button
                type="button"
                style={s.upgradeBtn}
                onClick={handleUpgrade}
              >
                Upgrade to Pro
              </button>
            </>
          )}
        </div>

        <div style={s.sectionLabel}>Bring your own Gemini key</div>
        <div style={s.card}>
          <input
            type="password"
            placeholder="API key (optional)"
            value={aiKey}
            autoComplete="off"
            onChange={handleByokChange}
            style={s.byokInput}
          />
          <div style={s.byokHint}>
            Stored locally only. When set, AI renders use your key directly
            with Google&rsquo;s Gemini API and bypass Vedute&rsquo;s per-month limit.
            {' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#c8b897' }}
            >
              Get a key →
            </a>
          </div>
        </div>

        <div style={s.sectionLabel}>My posters</div>
        <div style={s.card}>
          {posters.length === 0 ? (
            <div style={s.postersEmpty}>
              Renders you produce in the editor will land here.
            </div>
          ) : (
            <div style={s.postersGrid}>
              {posters.slice(0, 12).map((p) => (
                <Link
                  key={p.id}
                  to="/gallery"
                  style={s.posterCard}
                  title={p.label}
                >
                  <img src={p.dataUrl} alt={p.label} style={s.posterImg} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
