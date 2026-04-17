// Thin wrappers around the custom window events that Scene.jsx listens for.
// Phase 3 sidebar components call these; Phase 5 will replace the channels
// with direct setter calls once the hooks own the camera lifecycle.

export function dispatchCameraSet({ tilt, heading, altitude, fov }) {
  const detail = {}
  if (tilt != null) detail.tilt = tilt
  if (heading != null) detail.heading = heading
  if (altitude != null) detail.altitude = altitude
  if (fov != null) detail.fov = fov
  window.dispatchEvent(new CustomEvent('camera-set', { detail }))
}

export function dispatchFlyTo({ lat, lng }) {
  window.dispatchEvent(new CustomEvent('fly-to', { detail: { lat, lng } }))
}

export function dispatchEffectsChanged() {
  window.dispatchEvent(new Event('effects-changed'))
}

export function dispatchSaveView() {
  window.dispatchEvent(new Event('save-view'))
}

export function dispatchSaveSession() {
  window.dispatchEvent(new Event('save-session'))
}
