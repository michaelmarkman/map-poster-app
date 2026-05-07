import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { fillModeAtom } from '../../editor/atoms/ui'
import { modalsAtom } from '../../editor/atoms/modals'

// Minimal keyboard shortcut surface for /app. The legacy useKeyboardShortcuts
// hook went away with /app-classic in Phase 1.2 (Help + Time Machine modals
// were retired alongside it). /app keeps the high-leverage handful:
//
//   V         save current view
//   G         open gallery modal
//   F         toggle fill mode (chrome-off)
//   P         toggle poster preview
//   E         export — quick-download (raw PNG, no AI). Replaces the
//             visible Capture button retired in Phase 2.7.
//   Cmd/Ctrl+S  flush session save now
//
// Shortcuts are ignored while typing in <input> / <textarea> / [contenteditable]
// so the search box, custom prompt, and rename inputs aren't hijacked.
//
// Esc handling lives in MockEditorShell's useMockEscape — this hook
// stays focused on the action shortcuts.
export default function useMockKeyboardShortcuts() {
  const setModals = useSetAtom(modalsAtom)
  // Functional setter only — we never read fillMode here, so destructuring
  // [fillMode, setFillMode] from useAtom would force the effect to
  // re-attach on every toggle. useSetAtom keeps the listener attached once.
  const setFillMode = useSetAtom(fillModeAtom)
  useEffect(() => {
    const onKey = (e) => {
      // Ignore when typing.
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return

      // Cmd/Ctrl+S — explicit save (in addition to the normal debounce)
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        try { window.dispatchEvent(new Event('save-session')) } catch {}
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key.toLowerCase()) {
        case 'v':
          e.preventDefault()
          window.dispatchEvent(new Event('save-view'))
          break
        case 'g':
          e.preventDefault()
          setModals((m) => ({ ...m, gallery: !m.gallery }))
          break
        case 'f':
          e.preventDefault()
          setFillMode((v) => !v)
          break
        case 'p':
          e.preventDefault()
          setModals((m) => ({ ...m, posterPreview: !m.posterPreview }))
          break
        case 'e':
          // Quick-download — useQueue listens to this and skips the AI
          // path entirely (raw snapshot → PNG download). Free for all
          // tiers. Visible Capture button moved off-screen in Phase 2.7;
          // E is the only way to trigger it now.
          e.preventDefault()
          window.dispatchEvent(new Event('quick-download'))
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setModals, setFillMode])
}
