const s = {
  page: {
    minHeight: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: '#09090b', fontFamily: "'Inter', system-ui, sans-serif",
    padding: '40px 24px', textAlign: 'center',
  },
  icon: { fontSize: 64, marginBottom: 24, opacity: 0.6 },
  title: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 28, fontWeight: 400, color: '#e8e4dc', marginBottom: 12, fontStyle: 'italic',
  },
  text: { color: '#5a5750', fontSize: 15, maxWidth: 400, marginBottom: 32, lineHeight: 1.6 },
  btn: {
    display: 'inline-block', padding: '12px 28px', background: '#c8b897', color: '#09090b',
    border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
    textDecoration: 'none', cursor: 'pointer',
  },
}

export default function CommunityPage() {
  return (
    <div style={s.page}>
      <div style={s.icon}>🗺️</div>
      <h1 style={s.title}>Community Gallery</h1>
      <p style={s.text}>Discover beautiful map posters shared by creators worldwide.</p>
      <a href="/prototypes/community.html" style={s.btn}>Browse gallery →</a>
    </div>
  )
}
