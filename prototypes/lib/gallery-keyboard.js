// ─── Gallery Keyboard Navigation ────────────────────────────
// Arrow keys to browse gallery items, Enter to open lightbox.

let focusedIdx = -1
let isGalleryOpen = false

export function initGalleryKeyboard() {
  // Watch for gallery open/close
  const observer = new MutationObserver(() => {
    const overlay = document.getElementById('gallery-overlay')
    const wasOpen = isGalleryOpen
    isGalleryOpen = overlay?.classList.contains('open') ?? false

    if (isGalleryOpen && !wasOpen) {
      focusedIdx = -1
      updateFocusRing()
    }
    if (!isGalleryOpen && wasOpen) {
      clearFocusRing()
      focusedIdx = -1
    }
  })

  const overlay = document.getElementById('gallery-overlay')
  if (overlay) {
    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] })
  }

  document.addEventListener('keydown', (e) => {
    if (!isGalleryOpen) return

    // Don't handle if lightbox or other modal is on top
    const lightbox = document.getElementById('lightbox')
    if (lightbox?.classList.contains('open')) return

    // Don't handle if input is focused
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    const cards = getGalleryCards()
    if (!cards.length) return

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        focusedIdx = Math.min(cards.length - 1, focusedIdx + 1)
        updateFocusRing()
        scrollIntoView(cards[focusedIdx])
        break

      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        focusedIdx = Math.max(0, focusedIdx - 1)
        updateFocusRing()
        scrollIntoView(cards[focusedIdx])
        break

      case 'Home':
        e.preventDefault()
        focusedIdx = 0
        updateFocusRing()
        scrollIntoView(cards[0])
        break

      case 'End':
        e.preventDefault()
        focusedIdx = cards.length - 1
        updateFocusRing()
        scrollIntoView(cards[focusedIdx])
        break

      case 'Enter':
      case ' ':
        e.preventDefault()
        if (focusedIdx >= 0 && focusedIdx < cards.length) {
          cards[focusedIdx].click()
        }
        break

      case 'Escape':
        // Let the existing Escape handler close the gallery
        break
    }
  })
}

function getGalleryCards() {
  const grid = document.getElementById('gallery-grid')
  if (!grid) return []
  return Array.from(grid.querySelectorAll('.gallery-card, .gallery-list-row'))
}

function updateFocusRing() {
  clearFocusRing()
  const cards = getGalleryCards()
  if (focusedIdx >= 0 && focusedIdx < cards.length) {
    cards[focusedIdx].classList.add('gk-focused')
  }
}

function clearFocusRing() {
  document.querySelectorAll('.gk-focused').forEach(el => el.classList.remove('gk-focused'))
}

function scrollIntoView(el) {
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
}

// CSS
const style = document.createElement('style')
style.textContent = `
  .gallery-card.gk-focused,
  .gallery-list-row.gk-focused {
    outline: 2px solid var(--accent, #c8b897);
    outline-offset: 2px;
    box-shadow: 0 0 0 4px rgba(200, 184, 151, 0.15);
  }
`
document.head.appendChild(style)
