import { useEffect } from 'react'
import { useSetAtom, useAtom } from 'jotai'
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
//   Cmd/Ctrl+S  flush session save now
//
// Shortcuts are ignored while typing in <input> / <textarea> / [contenteditable]
// so the search box, custom prompt, and rename inputs aren't hijacked.
//
// Esc handling lives in MockEditorShell's useMockEscape — this hook
// stays focused on the action shortcuts.
export default function useMockKeyboardShortcuts() {
  const setModals = useSetAtom(modalsAtom)
  const [fillMode, setFillMode] = useAtom(fillModeAtom)
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
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setModals, fillMode, setFillMode])
}
