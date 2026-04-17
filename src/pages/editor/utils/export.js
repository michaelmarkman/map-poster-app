// Export helpers — lifted from prototypes/poster-v3-ui.jsx (snapshotCanvas
// ~2297, compositeExport ~2305) and prototypes/editor-overlay.jsx
// (compositeExport ~1027). Kept as a plain util so the queue hook can snapshot
// without having to hold a ref to the R3F canvas itself.
//
// The R3F canvas lives inside `#r3f-root` (see EditorShell); the prototype
// reaches for it via `document.querySelector('#r3f-root canvas')` and we do
// the same here so non-React callers (event handlers, tests) don't need a
// ref.

// Locate the live R3F canvas. Returns null if the editor isn't mounted yet —
// callers should treat null as "nothing to export" rather than erroring.
function findCanvas() {
  return document.querySelector('#r3f-root canvas')
}

// Snapshot the current 3D canvas at `resolution` multiplier. Resolution is a
// multiplier on the canvas' native pixel size (1 = 1:1, 2 = 2x, …).
//
// Canvas.toDataURL returns whatever pixels the canvas currently holds, so
// "resolution" is realised by drawing the canvas onto an upscaled 2D canvas
// and reading that back out. For resolution = 1 we skip the copy and return
// the source canvas' dataURL directly.
export function snapshotCanvas(resolution = 2) {
  const canvas = findCanvas()
  if (!canvas) return null
  if (!resolution || resolution <= 1) return canvas.toDataURL('image/png')

  try {
    const w = Math.round(canvas.width * resolution)
    const h = Math.round(canvas.height * resolution)
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const ctx = out.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(canvas, 0, 0, w, h)
    return out.toDataURL('image/png')
  } catch (e) {
    // Fall back to native resolution so the caller still gets something.
    return canvas.toDataURL('image/png')
  }
}

// Check whether the Fabric-backed editor overlay has any user content we need
// to composite in. Phase 5 delivery skips the actual bridge — the overlay
// module lives at prototypes/editor-overlay.jsx today and there's no React
// port yet — so this always reports false. Wiring it up is tracked via the
// TODO in `composite` below.
export function isEditorActive() {
  // TODO(Phase 6+): when the editor overlay is ported to React, expose its
  // live state via a module export or window hook and return that here.
  return false
}

// Composite the 3D map snapshot with the editor overlay's graphics layer.
// Mirrors compositeExport in prototypes/editor-overlay.jsx:1027.
//
// Until the overlay is ported (see isEditorActive above) this is a passthrough
// that returns the original mapDataUrl. The signature matches the final
// intended shape so callers don't need to change once the overlay lands.
export function composite(mapDataUrl /* , graphicsCanvas */) {
  // TODO(Phase 6+): when `graphicsCanvas` is supplied and `isEditorActive()`
  // is true, draw both onto a single canvas at mapDataUrl's native size and
  // return the merged dataURL (see editor-overlay.jsx:1027 for reference).
  return mapDataUrl
}

// Trigger a browser download for an in-memory dataURL. Mirrors the inline
// <a> pattern used throughout poster-v3-ui.jsx (e.g. lines 2271, 2353, 2411).
export function downloadDataUrl(dataUrl, filename) {
  if (!dataUrl) return
  const link = document.createElement('a')
  link.download = filename.endsWith('.png') ? filename : filename + '.png'
  link.href = dataUrl
  // Chrome needs the anchor in the DOM for the click to fire in some cases
  // (notably when the click originates outside a user gesture, e.g. inside a
  // promise chain from generate-all).
  document.body.appendChild(link)
  link.click()
  link.remove()
}

// Slug helper shared across filename builders. Lifted from poster-v3-ui.jsx
// (slugify ~1959) so the queue hook doesn't have to reimplement it.
function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40)
}

// Build a suggested filename for a render. Matches poster-v3-ui.jsx:1981
// closely so filenames stay consistent with the prototype.
export function buildFilename(style, { resolution = 1, location = '' } = {}) {
  const parts = ['mapposter']
  if (location) parts.push(slugify(location.split(',')[0]))
  if (style) parts.push(slugify(style))
  if (resolution > 1) parts.push(resolution + 'x')
  const d = new Date()
  parts.push(
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`,
    `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`,
  )
  return parts.join('-')
}
