const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#09090b',
    padding: '24px',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: '#0f0f12',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: '40px 32px',
  },
  title: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 28,
    fontWeight: 400,
    color: '#e8e4dc',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: '#5a5750',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
  },
}

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <h1 style={styles.title}>{title}</h1>
        {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
        {children}
      </div>
    </div>
  )
}
