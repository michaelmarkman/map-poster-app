import { useEffect, useRef } from 'react'
import { IS_MOBILE } from '../atoms/scene'
import { sceneRef } from '../scene/stateRef'

// Loads the legacy Fabric.js editor once the React DOM skeleton
// (GraphicEditorOverlay) is mounted. Wires on next tick so the
// toolbar/props-panel elements exist before `initEditor` runs
// `document.getElementById(...)` to attach listeners.
//
// The editor is created as hidden (setEditorActive(false) inside
// initEditor). The sidebar's "Open Editor" button has id="editor-toggle-btn"
// which wireToolbar binds to a toggle handler — so the user's click
// flips .active on the toolbar and the editor turns on.
// Module-level state — survives React strict-mode double mounts (which
// otherwise tear down the event listener on the first cleanup and then
// skip re-attaching because the inited-ref is already true).
let modulePromise = null
let inited = false

function loadModule() {
  if (!modulePromise) {
    modulePromise = import(/* @vite-ignore */ '/prototypes/editor-overlay.jsx').catch((e) => {
      console.warn('[graphic-editor] failed to load:', e?.message)
      modulePromise = null
      return null
    })
  }
  return modulePromise
}

export default function useGraphicEditor() {
  useEffect(() => {
    if (IS_MOBILE) return // Fabric's tiny handles are unusable on touch

    // Eager-load + initialize on first mount so the toolbar/canvas are
    // ready before a click. Subsequent mounts (strict-mode remount,
    // route re-entry) just await the cached promise — initEditor is
    // guarded against double-init via the module-level `inited` flag.
    const t = setTimeout(async () => {
      const mod = await loadModule()
      if (mod && !inited) {
        inited = true
        mod.initEditor?.()
        // Expose the Fabric canvas to the export pipeline (composite()
        // reads window.__editorOverlayFabric synchronously).
        try { window.__editorOverlayFabric = mod.fabricCanvas } catch {}
      }
    }, 0)

    // Bridge window event → setEditorActive. After flipping, broadcast
    // the new state via a `graphic-editor-changed` event + body class so
    // /mock can switch into "edit mode" (hide scene controls, swap pill
    // label, etc.).
    const broadcast = (active) => {
      sceneRef.editorActive = !!active
      // Also expose on window so the scene-input gates have a path that
      // can't be defeated by separate module instances (HMR/Vite can hand
      // out different copies of stateRef in some cases).
      try { window.__editorActive = !!active } catch {}
      try { document.body.classList.toggle('mock-editor-active', !!active) } catch {}
      try {
        window.dispatchEvent(new CustomEvent('graphic-editor-changed', { detail: { active: !!active } }))
      } catch {}
    }
    const onToggle = async () => {
      const mod = await loadModule()
      if (!mod) return
      if (!inited) {
        inited = true
        mod.initEditor?.()
        try { window.__editorOverlayFabric = mod.fabricCanvas } catch {}
      }
      if (mod.setEditorActive && mod.isEditorActive) {
        const next = !mod.isEditorActive()
        mod.setEditorActive(next)
        broadcast(next)
      }
    }
    window.addEventListener('toggle-graphic-editor', onToggle)
    return () => {
      clearTimeout(t)
      window.removeEventListener('toggle-graphic-editor', onToggle)
    }
  }, [])
}
