export default function AuthInput({ label, error, ...props }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && (
        <label style={{
          display: 'block', fontSize: 13, color: '#8a8780',
          marginBottom: 6, fontFamily: "'Inter', system-ui, sans-serif",
        }}>
          {label}
        </label>
      )}
      <input
        {...props}
        style={{
          width: '100%', padding: '10px 14px',
          background: '#151518', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, color: '#e8e4dc', fontSize: 14,
          fontFamily: "'Inter', system-ui, sans-serif",
          outline: 'none', transition: 'border-color 0.15s',
          ...(error ? { borderColor: '#e55353' } : {}),
        }}
        onFocus={e => e.target.style.borderColor = '#c8b897'}
        onBlur={e => e.target.style.borderColor = error ? '#e55353' : 'rgba(255,255,255,0.08)'}
      />
      {error && (
        <p style={{ color: '#e55353', fontSize: 12, marginTop: 4 }}>{error}</p>
      )}
    </div>
  )
}
