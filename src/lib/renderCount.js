// Per-month render counter. Lives in localStorage so it survives reloads.
// Used by entitlements to gate free-tier submission.
//
// Keyed by YYYY-MM so the count resets at the start of each calendar
// month (UTC) without needing a cron. We don't need Stripe yet — the
// count is a soft floor for the free tier; once payment is wired, the
// remote tier flag bypasses this layer entirely.
//
// Resolution: only AI renders count toward the limit. Quick downloads
// and local-only operations (save view, navigate) are free.

const STORAGE_KEY = 'vedute_render_count'

function bucket() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { bucket: bucket(), count: 0 }
    const data = JSON.parse(raw)
    if (data?.bucket !== bucket()) {
      // New month — reset counter.
      return { bucket: bucket(), count: 0 }
    }
    return { bucket: data.bucket, count: data.count || 0 }
  } catch {
    return { bucket: bucket(), count: 0 }
  }
}

function write(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

export function getRenderCount() {
  return read().count
}

export function incrementRenderCount(by = 1) {
  const cur = read()
  const next = { bucket: cur.bucket, count: cur.count + by }
  write(next)
  return next.count
}

export function resetRenderCount() {
  write({ bucket: bucket(), count: 0 })
}
