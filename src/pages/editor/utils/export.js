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

// In /mock the WebGL canvas is full viewport but the actual poster is only
// the white-bordered frame in the middle. The frame element's bounding rect
// gives us the exact crop region in viewport CSS pixels. Returns null when
// the frame overlay isn't rendered (i.e. /app, or /mock in fill mode) —
// callers should fall back to the full canvas. */
function findFrameCrop() {
  const border = document.querySelector('.mock-frame-border')
  if (!border) return null
  const r = border.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return null
  return r
}

// Snapshot the current 3D canvas at `resolution` multiplier. Resolution is a
// multiplier on the output's native pixel size (1 = 1:1, 2 = 2x, …).
//
// In /mock with a frame active, crops the canvas to the poster region so
// downstream consumers (AI render, downloads) get just the framed image
// instead of the full-viewport scene.
export function snapshotCanvas(resolution = 2) {
  const canvas = findCanvas()
  if (!canvas) return null

  const frame = findFrameCrop()
  if (frame) {
    try {
      const canvasRect = canvas.getBoundingClientRect()
      // Pixel ratio between the canvas's internal buffer and its CSS size.
      const sx = canvas.width / canvasRect.width
      const sy = canvas.height / canvasRect.height
      const srcX = (frame.left - canvasRect.left) * sx
      const srcY = (frame.top - canvasRect.top) * sy
      const srcW = frame.width * sx
      const srcH = frame.height * sy
      const outW = Math.round(frame.width * resolution)
      const outH = Math.round(frame.height * resolution)
      const out = document.createElement('canvas')
      out.width = outW
      out.height = outH
      const ctx = out.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, outW, outH)
      return out.toDataURL('image/png')
    } catch {
      // Fall through to full-canvas snapshot.
    }
  }

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
// to composite in. Looks up the live module that was lazy-loaded by
// useGraphicEditor.
function getFabricCanvas() {
  // The lazy-loaded prototype module exposes `fabricCanvas`. We don't await
  // here because composite() runs synchronously from the export pipeline —
  // if Fabric hasn't loaded yet, there are no graphics to composite anyway.
  try {
    // Vite caches dynamic imports, so this is fast. But the first call
    // returns a promise that we can't await. Use a side-channel via window
    // instead — useGraphicEditor stashes the module on window.__editorOverlay
    // when the editor first activates.
    return window.__editorOverlayFabric || null
  } catch {
    return null
  }
}

export function isEditorActive() {
  const c = getFabricCanvas()
  return !!(c && c.getObjects && c.getObjects().filter((o) => !o.excludeFromExport).length > 0)
}

// Composite the 3D map snapshot with the editor overlay's graphics layer.
// Returns the merged data URL synchronously (the original signature) when no
// graphics are present, otherwise returns a Promise<dataUrl>. The /mock
// queue handler awaits whatever it gets back, so a sometimes-promise return
// is OK — but we keep the sync fast-path so /app stays unchanged when the
// editor isn't in use.
export function composite(mapDataUrl, opts = {}) {
  const { includeGraphics = true } = opts
  if (!mapDataUrl || !includeGraphics) return mapDataUrl
  const fabric = getFabricCanvas()
  if (!fabric || !fabric.getObjects) return mapDataUrl
  const objects = fabric.getObjects().filter((o) => !o.excludeFromExport)
  if (objects.length === 0) return mapDataUrl

  // Render the Fabric canvas at the map snapshot's pixel size so they
  // align cleanly. The Fabric canvas in /mock is sized to the frame area
  // (via useFabricFrameSync) so the snapshot and overlay share the same
  // coordinate space.
  return new Promise((resolve) => {
    const bgImg = new Image()
    bgImg.onload = () => {
      try {
        const w = bgImg.naturalWidth
        const h = bgImg.naturalHeight
        const out = document.createElement('canvas')
        out.width = w
        out.height = h
        const ctx = out.getContext('2d')
        ctx.drawImage(bgImg, 0, 0, w, h)
        const overlayUrl = fabric.toDataURL({
          format: 'png',
          multiplier: w / fabric.width,
        })
        const overlayImg = new Image()
        overlayImg.onload = () => {
          ctx.drawImage(overlayImg, 0, 0, w, h)
          resolve(out.toDataURL('image/png'))
        }
        overlayImg.onerror = () => resolve(mapDataUrl)
        overlayImg.src = overlayUrl
      } catch {
        resolve(mapDataUrl)
      }
    }
    bgImg.onerror = () => resolve(mapDataUrl)
    bgImg.src = mapDataUrl
  })
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
