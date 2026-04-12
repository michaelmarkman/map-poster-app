export default function AuthButton({ children, loading, ...props }) {
  return (
    <button
      disabled={loading}
      {...props}
      style={{
        width: '100%', padding: '12px 16px',
        background: loading ? '#8a7a50' : '#c4a467',
        color: '#09090b', border: 'none', borderRadius: 8,
        fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
        fontFamily: "'Inter', system-ui, sans-serif",
        transition: 'background 0.15s',
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? 'Loading...' : children}
    </button>
  )
}
