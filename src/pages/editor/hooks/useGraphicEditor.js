import { useEffect, useRef } from 'react'
import { IS_MOBILE } from '../atoms/scene'

// Loads the legacy Fabric.js editor once the React DOM skeleton
// (GraphicEditorOverlay) is mounted. Wires on next tick so the
// toolbar/props-panel elements exist before `initEditor` runs
// `document.getElementById(...)` to attach listeners.
//
// The editor is created as hidden (setEditorActive(false) inside
// initEditor). The sidebar's "Open Editor" button has id="editor-toggle-btn"
// which wireToolbar binds to a toggle handler — so the user's click
// flips .active on the toolbar and the editor turns on.
export default function useGraphicEditor() {
  const initedRef = useRef(false)

  useEffect(() => {
    if (IS_MOBILE) return // Fabric's tiny handles are unusable on touch
    if (initedRef.current) return
    initedRef.current = true

    // Wait a tick so GraphicEditorOverlay is in the DOM, then load Fabric
    // and initialize. The dynamic import keeps Fabric.js (~360KB) out of
    // the critical-path bundle.
    const t = setTimeout(async () => {
      try {
        const mod = await import(/* @vite-ignore */ '/prototypes/editor-overlay.jsx')
        // initEditor is idempotent-ish: it creates a Fabric canvas and
        // attaches listeners. Calling twice would double-bind toolbar
        // handlers — that's what initedRef guards against.
        mod.initEditor?.()
      } catch (e) {
        console.warn('[graphic-editor] failed to load:', e?.message)
        initedRef.current = false
      }
    }, 0)
    return () => clearTimeout(t)
  }, [])
}
