// Thin wrappers around the custom window events that Scene.jsx listens for.
// dispatchCameraSet / dispatchEffectsChanged / dispatchSaveView /
// dispatchSaveSession lived here too back when /app-classic's sidebar
// components called them; that surface was deleted in Phase 1.2 along
// with the helpers. The remaining sites that fire those events do so
// inline (window.dispatchEvent) — see useMockKeyboardShortcuts +
// ClusterTopLeft for examples.

export function dispatchFlyTo({ lat, lng }) {
  window.dispatchEvent(new CustomEvent('fly-to', { detail: { lat, lng } }))
}
