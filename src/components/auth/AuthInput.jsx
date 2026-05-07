export default function AuthInput({ label, error, ...props }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {/* Wrap the input inside the label so the two are implicitly
       * associated — a screen reader (and Testing Library's getByLabelText)
       * resolves the input as the label's target without us threading
       * htmlFor/id through every call site. The original split made the
       * label render as plain decorative text. */}
      <label>
        {label && (
          <span style={{
            display: 'block', fontSize: 13, color: '#8a8780',
            marginBottom: 6, fontFamily: "'Inter', system-ui, sans-serif",
          }}>
            {label}
          </span>
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
      </label>
      {error && (
        <p style={{ color: '#e55353', fontSize: 12, marginTop: 4 }}>{error}</p>
      )}
    </div>
  )
}
