import { useAtom } from 'jotai'
import { modalsAtom } from '../atoms/modals'

// Keyboard shortcuts help overlay. Triggered by `?` (see hooks/useKeyboardShortcuts.js).
// Always-mounted like the other modals; self-gates on modalsAtom.help.

const SHORTCUTS = [
  { keys: ['?'], label: 'Show keyboard shortcuts' },
  { keys: ['\u2318', 'S'], label: 'Save session', combo: true },
  { keys: ['G'], label: 'Open gallery' },
  { keys: ['T'], label: 'Open time machine' },
  { keys: ['V'], label: 'Save current view' },
  { keys: ['F'], label: 'Toggle fill mode' },
  { keys: ['P'], label: 'Toggle poster preview' },
  { keys: ['\\'], label: 'Toggle sidebar' },
  { keys: ['Esc'], label: 'Close modal / panel' },
]

export default function HelpModal() {
  const [modals, setModals] = useAtom(modalsAtom)
  const open = !!modals.help
  if (!open) return null

  const close = () => setModals({ ...modals, help: false })

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 400,
    display: 'flex',
    background: 'rgba(0,0,0,0.8)',
    backdropFilter: 'blur(8px)',
    alignItems: 'center',
    justifyContent: 'center',
  }
  const panelStyle = {
    background: '#1e1d23',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    maxWidth: 380,
    width: 'calc(100% - 48px)',
    padding: 28,
    position: 'relative',
  }
  const closeBtnStyle = {
    position: 'absolute',
    top: 12,
    right: 12,
    background: 'none',
    border: 'none',
    color: 'var(--ink-dim)',
    fontSize: 20,
    cursor: 'pointer',
  }
  const headingStyle = {
    fontFamily: 'var(--serif)',
    fontWeight: 400,
    fontSize: 20,
    marginBottom: 18,
  }
  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '8px 0',
  }
  const keyGroupStyle = {
    display: 'inline-flex',
    gap: 4,
    flexShrink: 0,
  }
  const keyStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 28,
    height: 24,
    padding: '0 8px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 5,
    fontFamily: "'SF Mono', ui-monospace, monospace",
    fontSize: 11,
    color: 'var(--ink)',
  }
  const labelStyle = {
    fontSize: 12,
    color: 'var(--ink-soft)',
  }

  return (
    <div id="help-modal" style={overlayStyle} onClick={close}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <button
          id="help-modal-close"
          type="button"
          style={closeBtnStyle}
          onClick={close}
          aria-label="Close"
        >
          ×
        </button>
        <h3 style={headingStyle}>Keyboard Shortcuts</h3>
        <div>
          {SHORTCUTS.map((s) => (
            <div key={s.label} style={rowStyle}>
              <span style={keyGroupStyle}>
                {s.keys.map((k, i) => (
                  <kbd key={i} style={keyStyle}>{k}</kbd>
                ))}
              </span>
              <span style={labelStyle}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
