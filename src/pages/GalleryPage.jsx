import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadGalleryEntries } from './editor/utils/galleryDb'

const accent = '#c8b897'

const s = {
  page: {
    minHeight: 'calc(100vh - 56px)',
    background: '#09090b',
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: '40px 24px 80px',
  },
  container: { maxWidth: 1100, margin: '0 auto' },
  hero: {
    textAlign: 'center',
    marginBottom: 40,
  },
  title: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 'clamp(28px, 4vw, 40px)',
    fontWeight: 400, color: '#e8e4dc',
    marginBottom: 12, fontStyle: 'italic',
  },
  subtitle: {
    color: '#5a5750', fontSize: 14, maxWidth: 480, margin: '0 auto', lineHeight: 1.6,
  },
  emptyWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', textAlign: 'center', padding: '80px 24px',
  },
  emptyIcon: { fontSize: 48, marginBottom: 16, opacity: 0.5 },
  emptyText: { color: '#5a5750', fontSize: 15, maxWidth: 400, marginBottom: 24, lineHeight: 1.6 },
  buttons: { display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  btn: {
    display: 'inline-block', padding: '12px 28px', background: accent, color: '#09090b',
    border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
    textDecoration: 'none', cursor: 'pointer',
  },
  secondaryBtn: {
    display: 'inline-block', padding: '12px 28px', background: '#151518',
    border: '1px solid rgba(255,255,255,0.08)', color: '#e8e4dc',
    borderRadius: 8, fontSize: 14, fontWeight: 600,
    textDecoration: 'none', cursor: 'pointer',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 16,
  },
  card: {
    position: 'relative',
    aspectRatio: '4 / 3',
    background: '#111114',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.04)',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'transform 0.2s, border-color 0.2s',
  },
  cardImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  cardMeta: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: '20px 14px 10px',
    background: 'linear-gradient(to top, rgba(9,9,11,0.85), transparent)',
    fontSize: 12, color: '#e8e4dc',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  cardLabel: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  publicBadge: {
    background: 'rgba(200,184,151,0.16)',
    color: accent,
    fontSize: 10,
    padding: '2px 8px',
    borderRadius: 999,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    flexShrink: 0,
    marginLeft: 8,
  },
  countLine: {
    color: '#5a5750', fontSize: 12, marginBottom: 12,
  },
}

export default function GalleryPage() {
  const [entries, setEntries] = useState(null)

  useEffect(() => {
    loadGalleryEntries().then((items) => {
      // newest first
      setEntries(items.slice().reverse())
    })
  }, [])

  // Listen for gallery-remove + gallery-add and refresh our local view.
  // A 3-style render batch fires 3 gallery-add events in rapid succession
  // (each runJob completion dispatches one) — without the debounce, that
  // means 3 IDB reads in ~2s, with the 2nd and 3rd showing stale data
  // for the items still settling. 200ms gives the batch room to land
  // before we re-read.
  useEffect(() => {
    let timer = null
    const refresh = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        loadGalleryEntries().then((items) => setEntries(items.slice().reverse()))
      }, 200)
    }
    window.addEventListener('gallery-remove', refresh)
    window.addEventListener('gallery-add', refresh)
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener('gallery-remove', refresh)
      window.removeEventListener('gallery-add', refresh)
    }
  }, [])

  const downloadEntry = (e, item) => {
    e.preventDefault()
    e.stopPropagation()
    const link = document.createElement('a')
    link.download = (item.filename || 'vedute') + '.png'
    link.href = item.dataUrl
    link.click()
  }

  if (entries === null) {
    return (
      <div style={s.page}>
        <div style={s.container}>
          <div style={s.hero}>
            <h1 style={s.title}>Your Gallery</h1>
          </div>
          <div style={s.emptyWrap}>
            <div style={{ ...s.emptyText, color: '#3a3835' }}>Loading…</div>
          </div>
        </div>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div style={s.page}>
        <div style={s.container}>
          <div style={s.hero}>
            <h1 style={s.title}>Your Gallery</h1>
            <p style={s.subtitle}>Renders you produce in the editor will land here.</p>
          </div>
          <div style={s.emptyWrap}>
            <div style={s.emptyIcon}>📸</div>
            <p style={s.emptyText}>Nothing yet. Make your first poster.</p>
            <div style={s.buttons}>
              <Link to="/app" style={s.btn}>Open editor →</Link>
              <Link to="/community" style={s.secondaryBtn}>Browse community</Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.container}>
        <div style={s.hero}>
          <h1 style={s.title}>Your Gallery</h1>
          <p style={s.subtitle}>Every poster you&rsquo;ve rendered, locally on this device.</p>
        </div>
        <div style={s.countLine}>{entries.length} {entries.length === 1 ? 'poster' : 'posters'}</div>
        <div style={s.grid}>
          {entries.map((item) => (
            <a
              key={item.id}
              href={item.dataUrl}
              download={(item.filename || 'vedute') + '.png'}
              onClick={(e) => downloadEntry(e, item)}
              style={s.card}
              title={`Download ${item.label || 'poster'}`}
            >
              <img src={item.dataUrl} alt={item.label || 'poster'} style={s.cardImg} />
              <div style={s.cardMeta}>
                <span style={s.cardLabel}>{item.label || 'Untitled'}</span>
                {item.isPublic && <span style={s.publicBadge}>Public</span>}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
