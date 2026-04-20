// Mirror of mock.css's --frame-h-padding / --frame-v-padding clamps. Keep
// these in sync with mock.css when those values change.
export function computeFrameRect(aspectRatio, fillMode) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (fillMode) return { x: 0, y: 0, w: vw, h: vh }
  const hPad = Math.max(80, Math.min(280, vw * 0.14))
  const vPad = Math.max(120, Math.min(200, vh * 0.16))
  const w = Math.min((vh - vPad) * aspectRatio, vw - hPad)
  const h = Math.min(vh - vPad, (vw - hPad) / aspectRatio)
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h }
}
