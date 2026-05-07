// Phase 7.3 share flow — copy a pre-formatted caption to clipboard,
// trigger the file download, toast on success. Used by both the
// gallery-card Share button (GalleryModal) and the Lightbox's Share
// button so the behavior stays in lockstep.
//
// Pre-rebrand history: a ShareModal was scaffolded but never built —
// clicking Share flipped a modalsAtom.share boolean nothing read. The
// silent UX bug was caught in an earlier round; this helper pins the
// replacement flow so the implementation can't drift between callers.

import { fireToast } from './toast'

const VEDUTE_DOMAIN = 'vedute.com'

// Build the social caption for an entry. Pure — no side effects.
// Falls back to 'Somewhere' if the entry has no location string.
export function buildShareCaption(entry) {
  const place = (entry?.location?.split(',')[0] || '').trim() || 'Somewhere'
  return `${place}. Made with Vedute — ${VEDUTE_DOMAIN}`
}

// Run the share side-effects. Resolves with whether the clipboard
// write succeeded so callers can phrase the toast correctly.
export async function shareEntry(entry) {
  if (!entry) return { captionCopied: false }
  const caption = buildShareCaption(entry)
  let captionCopied = false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(caption)
      captionCopied = true
    }
  } catch {
    // Clipboard write can throw on insecure contexts / permission denial;
    // download still runs.
  }
  if (entry.dataUrl) {
    const link = document.createElement('a')
    const base = entry.filename || entry.label || 'vedute'
    link.download = base.endsWith('.png') ? base : base + '.png'
    link.href = entry.dataUrl
    link.click()
  }
  fireToast(
    'success',
    captionCopied ? 'Caption copied · image downloading' : 'Image downloading',
  )
  return { captionCopied }
}
