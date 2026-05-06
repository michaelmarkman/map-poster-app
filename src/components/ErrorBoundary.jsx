import { Component } from 'react'

// App-level safety net. Without this, anything that throws during render
// (a corrupt saved view, an unexpected atom shape, a third-party module
// that calls into a missing global) unmounts the entire React tree and
// the user sees a blank white page with no way to recover.
//
// We catch the error, show a small "something went wrong" panel with the
// error message + a Reload button, and stay out of the way otherwise.
// This is the simplest viable boundary — no Sentry hookup, no retry
// strategies, no granular fallbacks. When we add real telemetry, the
// componentDidCatch hook is the place to call it.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Best-effort log. In dev this surfaces in the console alongside the
    // React-rendered stack; in prod it gives a hook for future telemetry.
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0c0a08',
          color: '#c8b897',
          fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif',
          padding: '32px',
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div
            style={{
              fontSize: 32,
              letterSpacing: '0.02em',
              marginBottom: 18,
              fontStyle: 'italic',
            }}
          >
            vedute
          </div>
          <div style={{ fontSize: 18, marginBottom: 12 }}>
            Something went wrong.
          </div>
          <div
            style={{
              fontSize: 13,
              opacity: 0.7,
              marginBottom: 20,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              wordBreak: 'break-word',
            }}
          >
            {String(this.state.error?.message || this.state.error || 'Unknown error')}
          </div>
          <button
            type="button"
            onClick={() => {
              // Full reload over react-state-reset because the error may
              // have left non-React state (event listeners, IDB
              // connections, atoms) in an inconsistent shape.
              window.location.reload()
            }}
            style={{
              background: 'transparent',
              color: '#c8b897',
              border: '1px solid #c8b897',
              padding: '10px 24px',
              borderRadius: 4,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              letterSpacing: '0.04em',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
