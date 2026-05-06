// Export helpers — snapshot the live R3F canvas to a PNG data URL,
// compose suggested filenames, trigger downloads. Kept as a plain util
// so the queue hook can snapshot without holding a ref to the canvas.
//
// The R3F canvas lives inside `#r3f-root`; we reach for it via querySelector
// so non-React callers (event handlers, tests) don't need a ref.
//
// (Phase 1.3 deleted the Fabric-graphics composite path that lived here.
// If you want to re-add a layered overlay later, build a new component +
// dedicated util — don't reach into globals like the old code did.)

function findCanvas() {
  return document.querySelector('#r3f-root canvas')
}

// In /app the WebGL canvas is full viewport but the actual poster is only
// the white-bordered frame in the middle. The frame element's bounding rect
// gives us the exact crop region in viewport CSS pixels. Returns null when
// the frame overlay isn't rendered (fill mode) — callers fall back to the
// full canvas.
function findFrameCrop() {
  const border = document.querySelector('.mock-frame-border')
  if (!border) return null
  const r = border.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return null
  return r
}

// Snapshot the current 3D canvas at `resolution` multiplier (1 = 1:1, 2 = 2x).
// In /app with a frame active, crops to the poster region so consumers
// (AI render, downloads) get just the framed image instead of the full
// viewport.
export function snapshotCanvas(resolution = 2) {
  const canvas = findCanvas()
  if (!canvas) return null

  const frame = findFrameCrop()
  if (frame) {
    try {
      const canvasRect = canvas.getBoundingClientRect()
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
    return canvas.toDataURL('image/png')
  }
}

// Phase 6 — bake a small "vedute" wordmark into the bottom-right of an
// image data URL. Async because it goes through a temporary <img> load.
// Returns the original URL on failure so the export pipeline doesn't
// silently drop the user's render. Free-tier consumers call this; pro/
// BYOK callers skip the wrapper entirely.
//
// Render at ~3% of image height in a refined serif (Fraunces with system
// fallback) so the mark reads as editorial signature, not as a tag.
export function applyWatermark(dataUrl) {
  if (!dataUrl) return Promise.resolve(dataUrl)
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.onload = () => {
        try {
          const out = document.createElement('canvas')
          out.width = img.naturalWidth
          out.height = img.naturalHeight
          const ctx = out.getContext('2d')
          ctx.drawImage(img, 0, 0)
          const fontPx = Math.max(12, Math.round(img.naturalHeight * 0.018))
          const padX = Math.round(fontPx * 1.4)
          const padY = Math.round(fontPx * 1.1)
          ctx.font = `500 ${fontPx}px Fraunces, "Iowan Old Style", Georgia, serif`
          ctx.textBaseline = 'alphabetic'
          ctx.textAlign = 'right'
          // Subtle: cream over a soft dark drop-shadow so it survives any
          // background. We don't want the mark to dominate.
          ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
          ctx.shadowBlur = Math.max(2, fontPx * 0.2)
          ctx.shadowOffsetY = 1
          ctx.fillStyle = 'rgba(232, 220, 192, 0.85)'
          ctx.fillText('vedute', img.naturalWidth - padX, img.naturalHeight - padY)
          resolve(out.toDataURL('image/png'))
        } catch {
          resolve(dataUrl)
        }
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    } catch {
      resolve(dataUrl)
    }
  })
}

// Trigger a browser download for an in-memory dataURL.
export function downloadDataUrl(dataUrl, filename) {
  if (!dataUrl) return
  const link = document.createElement('a')
  link.download = filename.endsWith('.png') ? filename : filename + '.png'
  link.href = dataUrl
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40)
}

// Build a suggested filename for a render. "vedute-<location>-<style>-<res>-<date>".
export function buildFilename(style, { resolution = 1, location = '' } = {}) {
  const parts = ['vedute']
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
