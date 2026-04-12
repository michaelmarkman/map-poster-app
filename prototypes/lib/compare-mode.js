// ─── Comparison Mode ────────────────────────────────────────
// Split-screen view showing two gallery images side by side
// with a draggable divider.

let compareOverlay = null

export function showCompare(leftUrl, rightUrl, leftLabel, rightLabel) {
  if (compareOverlay) {
    compareOverlay.remove()
    compareOverlay = null
  }

  compareOverlay = document.createElement('div')
  compareOverlay.id = 'compare-overlay'

  const backdrop = document.createElement('div')
  backdrop.className = 'cmp-backdrop'
  backdrop.addEventListener('click', hideCompare)

  const container = document.createElement('div')
  container.className = 'cmp-container'

  // Close button
  const closeBtn = document.createElement('button')
  closeBtn.className = 'cmp-close'
  closeBtn.type = 'button'
  closeBtn.textContent = '\u00d7'
  closeBtn.addEventListener('click', hideCompare)

  // Left panel
  const leftPanel = document.createElement('div')
  leftPanel.className = 'cmp-panel cmp-left'
  const leftImg = document.createElement('img')
  leftImg.className = 'cmp-img'
  leftImg.src = leftUrl
  const leftLbl = document.createElement('div')
  leftLbl.className = 'cmp-label'
  leftLbl.textContent = leftLabel || 'Left'
  leftPanel.appendChild(leftImg)
  leftPanel.appendChild(leftLbl)

  // Divider
  const divider = document.createElement('div')
  divider.className = 'cmp-divider'
  const handle = document.createElement('div')
  handle.className = 'cmp-handle'
  handle.textContent = '\u2194'
  divider.appendChild(handle)

  // Right panel
  const rightPanel = document.createElement('div')
  rightPanel.className = 'cmp-panel cmp-right'
  const rightImg = document.createElement('img')
  rightImg.className = 'cmp-img'
  rightImg.src = rightUrl
  const rightLbl = document.createElement('div')
  rightLbl.className = 'cmp-label'
  rightLbl.textContent = rightLabel || 'Right'
  rightPanel.appendChild(rightImg)
  rightPanel.appendChild(rightLbl)

  container.appendChild(leftPanel)
  container.appendChild(divider)
  container.appendChild(rightPanel)
  container.appendChild(closeBtn)

  compareOverlay.appendChild(backdrop)
  compareOverlay.appendChild(container)
  document.body.appendChild(compareOverlay)

  // Drag divider to resize
  let dragging = false
  let startX = 0
  let startLeftWidth = 50

  divider.addEventListener('pointerdown', (e) => {
    dragging = true
    startX = e.clientX
    const rect = container.getBoundingClientRect()
    startLeftWidth = (leftPanel.offsetWidth / rect.width) * 100
    e.preventDefault()
    divider.setPointerCapture(e.pointerId)
  })

  divider.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const rect = container.getBoundingClientRect()
    const dx = e.clientX - startX
    const pctDelta = (dx / rect.width) * 100
    const newLeft = Math.max(15, Math.min(85, startLeftWidth + pctDelta))
    leftPanel.style.flex = `0 0 ${newLeft}%`
    rightPanel.style.flex = `0 0 ${100 - newLeft}%`
  })

  divider.addEventListener('pointerup', () => { dragging = false })
  divider.addEventListener('lostpointercapture', () => { dragging = false })

  requestAnimationFrame(() => compareOverlay.classList.add('cmp-open'))
}

export function hideCompare() {
  if (compareOverlay) {
    compareOverlay.classList.remove('cmp-open')
    setTimeout(() => {
      compareOverlay?.remove()
      compareOverlay = null
    }, 300)
  }
}

// Wire into gallery: compare button appears when 2 images are selected
export function initCompareMode() {
  // Add compare instructions to gallery header
  const galleryHeader = document.querySelector('.gallery-header .gallery-actions')
  if (!galleryHeader) return

  const compareBtn = document.createElement('button')
  compareBtn.className = 'gallery-btn'
  compareBtn.id = 'gallery-compare-btn'
  compareBtn.type = 'button'
  compareBtn.textContent = 'Compare'
  compareBtn.style.display = 'none'
  compareBtn.title = 'Select two gallery images to compare side by side'

  // Insert before download all
  const dlAll = document.getElementById('gallery-download-all')
  if (dlAll) galleryHeader.insertBefore(compareBtn, dlAll)
  else galleryHeader.appendChild(compareBtn)

  // Track selected gallery items for compare
  let selected = []

  // Use event delegation on the gallery grid
  const grid = document.getElementById('gallery-grid')
  if (grid) {
    grid.addEventListener('dblclick', (e) => {
      const card = e.target.closest('.gallery-card, .gallery-list-row')
      if (!card) return
      const idx = +card.dataset.galleryIdx
      if (isNaN(idx)) return

      e.stopPropagation()

      // Toggle selection
      if (selected.includes(idx)) {
        selected = selected.filter(i => i !== idx)
        card.classList.remove('cmp-selected')
      } else {
        if (selected.length >= 2) {
          // Deselect oldest
          const oldIdx = selected.shift()
          const oldCard = grid.querySelector(`[data-gallery-idx="${oldIdx}"]`)
          if (oldCard) oldCard.classList.remove('cmp-selected')
        }
        selected.push(idx)
        card.classList.add('cmp-selected')
      }

      compareBtn.style.display = selected.length === 2 ? '' : 'none'
    })
  }

  compareBtn.addEventListener('click', () => {
    if (selected.length !== 2) return
    // Access the gallery array (global on window from poster-v3-ui.jsx)
    const g = window.__gallery || []
    const left = g[selected[0]]
    const right = g[selected[1]]
    if (!left || !right) return
    showCompare(left.dataUrl, right.dataUrl, left.label, right.label)
  })
}

// CSS
const style = document.createElement('style')
style.textContent = `
  #compare-overlay {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 400;
    align-items: center;
    justify-content: center;
  }
  #compare-overlay.cmp-open { display: flex; }
  .cmp-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(6, 5, 8, 0.92);
    backdrop-filter: blur(12px);
  }
  .cmp-container {
    position: relative;
    display: flex;
    width: 90vw;
    height: 80vh;
    max-width: 1400px;
    gap: 0;
    z-index: 1;
  }
  .cmp-panel {
    flex: 0 0 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    padding: 20px;
  }
  .cmp-img {
    max-width: 100%;
    max-height: calc(100% - 40px);
    object-fit: contain;
    border-radius: 2px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.4);
  }
  .cmp-label {
    font-size: 11px;
    color: rgba(236,234,227,0.5);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-top: 14px;
    text-align: center;
  }
  .cmp-divider {
    width: 4px;
    cursor: ew-resize;
    background: rgba(255,255,255,0.1);
    position: relative;
    z-index: 2;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .cmp-divider:hover {
    background: rgba(200,184,151,0.4);
  }
  .cmp-handle {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 28px;
    height: 28px;
    background: rgba(28,27,31,0.9);
    border: 0.5px solid rgba(255,255,255,0.15);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: rgba(236,234,227,0.6);
    pointer-events: none;
  }
  .cmp-close {
    position: absolute;
    top: 14px;
    right: 14px;
    z-index: 3;
    background: rgba(20,19,23,0.72);
    backdrop-filter: blur(20px);
    border: 0.5px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    width: 38px;
    height: 38px;
    color: rgba(236,234,227,0.6);
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    font-family: inherit;
  }
  .cmp-close:hover { background: rgba(30,29,33,0.85); color: #eceae3; }

  /* Gallery card selection highlight for compare */
  .gallery-card.cmp-selected,
  .gallery-list-row.cmp-selected {
    outline: 2px solid var(--accent, #c8b897);
    outline-offset: 2px;
  }
`
document.head.appendChild(style)
