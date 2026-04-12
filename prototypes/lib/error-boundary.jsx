// ─── Error Boundary ─────────────────────────────────────────
// Catches React/WebGL errors and shows a friendly recovery UI

import React from 'react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary${this.props.name ? ` — ${this.props.name}` : ''}]`, error, info)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1c1b1f',
          color: '#eceae3',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
          gap: '16px',
          padding: '40px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '36px', opacity: 0.5 }}>⚠</div>
          <div style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: '20px',
            fontWeight: 300,
          }}>
            Something went wrong
          </div>
          <div style={{
            fontSize: '13px',
            color: 'rgba(236,234,227,0.5)',
            maxWidth: '400px',
            lineHeight: 1.6,
          }}>
            {this.props.name === 'editor'
              ? 'The 3D editor encountered an error. This might be a WebGL compatibility issue.'
              : 'An unexpected error occurred.'}
          </div>
          <button
            onClick={this.handleRetry}
            style={{
              marginTop: '8px',
              background: 'rgba(200, 184, 151, 0.2)',
              border: '0.5px solid rgba(200, 184, 151, 0.4)',
              color: '#c8b897',
              fontSize: '13px',
              padding: '10px 24px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Try again
          </button>
          {this.state.error && (
            <details style={{
              marginTop: '12px',
              fontSize: '10px',
              color: 'rgba(236,234,227,0.3)',
              maxWidth: '500px',
              textAlign: 'left',
            }}>
              <summary style={{ cursor: 'pointer' }}>Error details</summary>
              <pre style={{
                marginTop: '8px',
                padding: '12px',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '6px',
                overflow: 'auto',
                maxHeight: '120px',
                whiteSpace: 'pre-wrap',
                fontFamily: "'SF Mono', ui-monospace, monospace",
              }}>
                {String(this.state.error)}
              </pre>
            </details>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
