const s = {
  page: {
    minHeight: 'calc(100vh - 56px)', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    background: '#09090b', fontFamily: "'Inter', system-ui, sans-serif",
  },
  text: { color: '#5a5750', fontSize: 15 },
}

export default function EditorPage() {
  return (
    <div style={s.page}>
      <p style={s.text}>Poster editor — coming soon</p>
    </div>
  )
}
