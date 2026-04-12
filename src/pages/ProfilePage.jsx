import { useState, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import AuthInput from '../components/auth/AuthInput'
import AuthButton from '../components/auth/AuthButton'

const s = {
  page: {
    minHeight: '100vh', background: '#09090b', padding: '40px 24px',
    fontFamily: "'Inter', system-ui, sans-serif", color: '#e8e4dc',
  },
  container: { maxWidth: 480, margin: '0 auto' },
  heading: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 28, fontWeight: 400, marginBottom: 32,
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
}

export default function ProfilePage() {
  const { profile, user, updateProfile, uploadAvatar } = useAuth()
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [bio, setBio] = useState(profile?.bio || '')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const fileRef = useRef(null)

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      await updateProfile({ display_name: displayName, bio })
      setSuccess('Profile updated')
      setEditing(false)
    } catch (err) {
      setError(err.message)
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
      setError(err.message)
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
                padding: '12px 24px', background: '#c4a467', color: '#09090b',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Edit profile
            </button>
          </>
        )}
      </div>
    </div>
  )
}
