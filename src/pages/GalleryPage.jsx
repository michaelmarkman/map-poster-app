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
  buttons: { display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  btn: {
    display: 'inline-block', padding: '12px 28px', background: '#c8b897', color: '#09090b',
    border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
    textDecoration: 'none', cursor: 'pointer',
  },
  secondaryBtn: {
    display: 'inline-block', padding: '12px 28px', background: '#151518',
    border: '1px solid rgba(255,255,255,0.08)', color: '#e8e4dc',
    borderRadius: 8, fontSize: 14, fontWeight: 600,
    textDecoration: 'none', cursor: 'pointer',
  },
}

export default function GalleryPage() {
  return (
    <div style={s.page}>
      <div style={s.icon}>📸</div>
      <h1 style={s.title}>Your Gallery</h1>
      <p style={s.text}>Your saved map posters will appear here. Create your first masterpiece!</p>
      <div style={s.buttons}>
        <a href="/prototypes/poster-v3-ui.html" style={s.btn}>Create a poster →</a>
        <a href="/prototypes/community.html" style={s.secondaryBtn}>Explore community</a>
      </div>
    </div>
  )
}
