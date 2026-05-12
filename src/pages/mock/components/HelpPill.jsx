import { useSetAtom } from 'jotai'
import PopoverPill from './PopoverPill'
import { onboardedAtom } from '../../editor/atoms/sidebar'

// Phase 4.2 — discoverable keyboard / control reference. Lives at the
// bottom-right corner near Gallery so it's reachable without crowding
// the action surface. Click → popover with the shortcut list and a
// "Show welcome card" link to re-trigger the onboarding overlay.

const SHORTCUTS = [
  { keys: ['drag'], action: 'Pan around' },
  { keys: ['Ctrl', '+', 'drag'], action: 'Orbit camera' },
  { keys: ['scroll'], action: 'Zoom in / out' },
  { keys: ['click'], action: 'Set focus point (DoF on)' },
  { keys: ['V'], action: 'Save current view' },
  { keys: ['G'], action: 'Open gallery' },
  { keys: ['F'], action: 'Toggle fill mode' },
  { keys: ['P'], action: 'Toggle poster preview' },
  { keys: ['Esc'], action: 'Close / collapse layers' },
  { keys: ['Cmd/Ctrl', '+', 'S'], action: 'Force-save session' },
]

export default function HelpPill() {
  const setOnboarded = useSetAtom(onboardedAtom)
  return (
    <PopoverPill
      label="?"
      align="right"
      drop="up"
      panelClassName="mock-popover--help"
      className="mock-pill--help"
      aria-label="Keyboard shortcuts and help"
    >
      {({ close }) => (
        <div className="vd-help">
          <div className="vd-help-title">Shortcuts</div>
          <ul className="vd-help-list">
            {SHORTCUTS.map((s, i) => (
              <li key={i}>
                <span className="vd-help-keys">
                  {s.keys.map((k, j) => (
                    <span
                      key={j}
                      className={k === '+' ? 'vd-help-plus' : 'vd-help-key'}
                    >
                      {k}
                    </span>
                  ))}
                </span>
                <span className="vd-help-action">{s.action}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="vd-help-replay"
            onClick={() => {
              setOnboarded(false)
              close()
            }}
          >
            Show welcome card again
          </button>
        </div>
      )}
    </PopoverPill>
  )
}
