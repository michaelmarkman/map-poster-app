import { useEffect, useRef } from 'react'
import { IS_MOBILE } from '../atoms/scene'

// Thin wrapper that loads the legacy Fabric.js graphic editor from the
// prototypes tree on demand. The editor mounts a canvas + toolbar + props
// panel as children of `#canvas-container`. We defer the import so the main
// editor bundle doesn't include Fabric.js (~350KB) until the user clicks
// "Open Editor".
export default function useGraphicEditor() {
  const loadedRef = useRef(null)
  useEffect(() => {
    // Skip on mobile — Fabric's tiny handles are unusable on touch. The
    // EditorSection already shows a "desktop only" placeholder.
    if (IS_MOBILE) return

    const handler = async () => {
      if (!loadedRef.current) {
        try {
          // Vite-ignore: dev path is ../../../../prototypes, prod path
          // depends on deploy layout. If the import fails (e.g. prototypes
          // aren't bundled into the SPA entry), we silently skip.
          loadedRef.current = await import(/* @vite-ignore */ '/prototypes/editor-overlay.jsx')
          loadedRef.current.initEditor?.()
          return
        } catch (e) {
          console.warn('[graphic-editor] lazy import failed:', e?.message)
          loadedRef.current = null
          return
        }
      }
      loadedRef.current.setEditorActive?.(!loadedRef.current.isEditorActive?.())
    }

    window.addEventListener('toggle-graphic-editor', handler)
    return () => window.removeEventListener('toggle-graphic-editor', handler)
  }, [])
}
