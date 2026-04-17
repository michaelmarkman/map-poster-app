import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { modalsAtom } from '../atoms/modals'
import { fillModeAtom } from '../atoms/ui'

// Global keyboard shortcuts — ported from prototypes/lib/keyboard-shortcuts.js.
// Mounted once from EditorShell. Shortcuts are ignored while typing in inputs
// (except Esc, which other handlers own anyway — this hook treats Esc as a
// no-op aside from closing the help modal).
//
// The `\` sidebar toggle is intentionally NOT handled here — Sidebar.jsx owns
// that key to avoid a double-toggle.

function isEditableTarget(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export default function useKeyboardShortcuts() {
  const setModals = useSetAtom(modalsAtom)
  const setFillMode = useSetAtom(fillModeAtom)

  useEffect(() => {
    const onKey = (e) => {
      // Esc: close help modal if open, then bail. Other modals own their own
      // Esc handlers via ModalManager.
      if (e.key === 'Escape') {
        setModals((m) => (m.help ? { ...m, help: false } : m))
        return
      }

      // Ignore shortcuts while typing.
      if (isEditableTarget(e.target) || isEditableTarget(document.activeElement)) return

      // Ctrl/Cmd+S — save session (prevent browser save).
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('save-session'))
        return
      }

      // Skip other modified combos so we don't steal browser shortcuts.
      if (e.ctrlKey || e.metaKey || e.altKey) return

      switch (e.key) {
        case '?':
          e.preventDefault()
          setModals((m) => ({ ...m, help: !m.help }))
          break
        case 'g':
        case 'G':
          e.preventDefault()
          setModals((m) => ({ ...m, gallery: true }))
          break
        case 't':
        case 'T':
          e.preventDefault()
          setModals((m) => ({ ...m, timeMachine: true }))
          // Mirror the event-based open path so hooks that only listen for
          // 'open-time-machine' still fire (useTimeMachine reads it to replay
          // the last persisted set).
          window.dispatchEvent(new CustomEvent('open-time-machine'))
          break
        case 'v':
        case 'V':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('save-view'))
          break
        case 'f':
        case 'F':
          e.preventDefault()
          setFillMode((v) => !v)
          break
        case 'p':
        case 'P':
          e.preventDefault()
          setModals((m) => ({ ...m, posterPreview: !m.posterPreview }))
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setModals, setFillMode])
}
