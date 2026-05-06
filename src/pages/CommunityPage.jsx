import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadGalleryEntries } from './editor/utils/galleryDb'

// Phase 7.2 — community page substance.
//
// Today the community feed is a single-user proxy: we pull the user's
// LOCAL gallery (IndexedDB) and treat it as the showcase. When the
// Supabase `gallery_entries` table lands (see
// docs/superpowers/plans/2026-05-06-monetization-handoff.md), this
// page swaps its data source for `is_public=true` rows from there
// without touching the rest of the layout.
//
// Until then this page demonstrates: the visual pattern of the feed,
// the per-card layout (image + author + location), and the empty
// state. It's also a useful place for a logged-out user to see what
// the product produces.

const s = {
  page: {
    minHeight: 'calc(100vh - 56px)',
    background: '#09090b',
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: '48px 24px 80px',
    color: '#e8e4dc',
  },
  container: { maxWidth: 1280, margin: '0 auto' },
  hero: { textAlign: 'center', marginBottom: 48 },
  title: {
    fontFamily: "'Fraunces', 'Playfair Display', Georgia, serif",
    fontSize: 40, fontWeight: 500, marginBottom: 12, letterSpacing: '0.005em',
  },
  subtitle: {
    fontSize: 16, color: '#8a8780', maxWidth: 540, margin: '0 auto', lineHeight: 1.5,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 20,
  },
  card: {
    background: '#151518', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12, overflow: 'hidden',
    transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), border-color 220ms',
  },
  cardImg: { width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block', background: '#0c0a08' },
  cardBody: { padding: '14px 16px 16px' },
  cardLabel: { fontSize: 14, fontWeight: 500, color: '#e8e4dc', marginBottom: 4 },
  cardMeta: { fontSize: 12, color: '#8a8780' },
  empty: {
    textAlign: 'center', padding: '80px 24px',
    color: '#8a8780',
  },
  emptyTitle: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 22, color: '#e8e4dc', marginBottom: 8,
  },
  emptyBody: { fontSize: 14, color: '#8a8780', maxWidth: 460, margin: '0 auto 24px' },
  emptyCta: {
    display: 'inline-block', padding: '12px 22px',
    background: '#c8b897', color: '#0c0a08',
    borderRadius: 8, fontSize: 13, fontWeight: 600,
    textDecoration: 'none', letterSpacing: '0.02em',
  },
  banner: {
    background: 'rgba(200,184,151,0.08)',
    border: '1px solid rgba(200,184,151,0.24)',
    borderRadius: 8,
    padding: '14px 18px',
    marginBottom: 32,
    fontSize: 13, color: '#c8b897', textAlign: 'center',
  },
}

export default function CommunityPage() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadGalleryEntries()
      .then((items) => setEntries(items.slice().reverse()))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={s.page}>
      <div style={s.container}>
        <div style={s.hero}>
          <h1 style={s.title}>Community</h1>
          <p style={s.subtitle}>
            Aerial city posters from the Vedute community. Browse, get inspired,
            jump into the editor and make your own.
          </p>
        </div>

        {/* TODO Phase 7.2 (Supabase): swap loadGalleryEntries() for a
            Supabase query against `gallery_entries WHERE is_public = true`
            ordered by created_at desc. The card layout below is final
            for that schema (image_url, author, location_name, created_at). */}
        <div style={s.banner}>
          You're seeing your local gallery here. Public sharing arrives with the next release.
        </div>

        {loading ? null : entries.length === 0 ? (
          <div style={s.empty}>
            <div style={s.emptyTitle}>Nothing here yet</div>
            <div style={s.emptyBody}>
              Render a poster in the editor — your finished pieces will land here
              and (once public sharing ships) appear in the community feed.
            </div>
            <Link to="/app" style={s.emptyCta}>Open the editor →</Link>
          </div>
        ) : (
          <div style={s.grid}>
            {entries.map((item) => (
              <Link
                key={item.id}
                to="/gallery"
                style={{ ...s.card, textDecoration: 'none', color: 'inherit' }}
              >
                <img src={item.dataUrl} alt={item.label} style={s.cardImg} />
                <div style={s.cardBody}>
                  <div style={s.cardLabel}>{item.label || 'Untitled'}</div>
                  <div style={s.cardMeta}>
                    {item.location || '—'} · {formatTime(item.time)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatTime(d) {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days < 1) return 'today'
  if (days < 2) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
