import { Link } from 'react-router-dom'

const accent = '#c8b897'

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#09090b',
    padding: '24px',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  // Wordmark above the card so visitors know what they're signing
  // into. Auth pages don't render the Navbar, so without this the
  // brand was completely absent from /login + /signup +
  // /forgot-password.
  brand: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 22,
    fontWeight: 400,
    fontStyle: 'italic',
    color: accent,
    textDecoration: 'none',
    marginBottom: 24,
    letterSpacing: '0.02em',
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
      <Link to="/" style={styles.brand}>Vedute</Link>
      <div style={styles.card}>
        <h1 style={styles.title}>{title}</h1>
        {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
        {children}
      </div>
    </div>
  )
}
