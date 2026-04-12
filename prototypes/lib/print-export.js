// ─── Print-Ready Export ─────────────────────────────────────
// Poster-size export with bleed marks and standard sizes
// Note: All DOM construction uses safe methods (textContent, createElement).

const POSTER_SIZES = [
  { label: '18\u00d724"', widthIn: 18, heightIn: 24 },
  { label: '24\u00d736"', widthIn: 24, heightIn: 36 },
  { label: 'A3', widthIn: 11.69, heightIn: 16.54 },
  { label: 'A2', widthIn: 16.54, heightIn: 23.39 },
]

const DPI = 300
const BLEED_MM = 3
const BLEED_IN = BLEED_MM / 25.4

let printModal = null

export function showPrintExport(imageDataUrl) {
  if (!imageDataUrl) return

  if (printModal) {
    printModal.remove()
    printModal = null
  }

  printModal = document.createElement('div')
  printModal.id = 'print-export-modal'

  const backdrop = document.createElement('div')
  backdrop.className = 'pe-backdrop'

  const panel = document.createElement('div')
  panel.className = 'pe-panel'

  const closeBtn = document.createElement('button')
  closeBtn.className = 'pe-close'
  closeBtn.type = 'button'
  closeBtn.textContent = '\u00d7'

  const title = document.createElement('div')
  title.className = 'pe-title'
  title.textContent = 'Print-Ready Export'

  const sub = document.createElement('div')
  sub.className = 'pe-sub'
  sub.textContent = 'Choose a poster size. Exports include 3mm bleed marks for professional printing.'

  const sizesGrid = document.createElement('div')
  sizesGrid.className = 'pe-sizes'

  let selectedIdx = 0

  POSTER_SIZES.forEach((s, i) => {
    const btn = document.createElement('button')
    btn.className = 'pe-size' + (i === 0 ? ' active' : '')
    btn.type = 'button'
    btn.dataset.idx = i

    const labelEl = document.createElement('span')
    labelEl.className = 'pe-size-label'
    labelEl.textContent = s.label

    const dimEl = document.createElement('span')
    dimEl.className = 'pe-size-dim'
    dimEl.textContent = `${s.widthIn}\u00d7${s.heightIn}"`

    const pxEl = document.createElement('span')
    pxEl.className = 'pe-size-px'
    pxEl.textContent = `${Math.round(s.widthIn * DPI)}\u00d7${Math.round(s.heightIn * DPI)}px`

    btn.appendChild(labelEl)
    btn.appendChild(dimEl)
    btn.appendChild(pxEl)

    btn.addEventListener('click', () => {
      sizesGrid.querySelectorAll('.pe-size').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      selectedIdx = i
    })

    sizesGrid.appendChild(btn)
  })

  const info = document.createElement('div')
  info.className = 'pe-info'
  const infoData = [
    ['Resolution', `${DPI} DPI`],
    ['Bleed', `${BLEED_MM}mm`],
    ['Format', 'High-res PNG'],
  ]
  infoData.forEach(([k, v]) => {
    const row = document.createElement('div')
    row.className = 'pe-info-row'
    const keyEl = document.createElement('span')
    keyEl.textContent = k
    const valEl = document.createElement('span')
    valEl.textContent = v
    row.appendChild(keyEl)
    row.appendChild(valEl)
    info.appendChild(row)
  })

  const exportBtn = document.createElement('button')
  exportBtn.className = 'pe-export-btn'
  exportBtn.type = 'button'
  exportBtn.textContent = 'Export Print-Ready File'

  const printHelp = document.createElement('div')
  printHelp.className = 'pe-print-help'
  const helpTitle = document.createElement('div')
  helpTitle.className = 'pe-help-title'
  helpTitle.textContent = 'Where to print'
  const helpLinks = document.createElement('div')
  helpLinks.className = 'pe-help-links'
  helpLinks.textContent = 'Print at home on a large-format printer, or use online services like Shutterfly, Snapfish, or your local print shop (Staples, FedEx Office, etc.)'
  printHelp.appendChild(helpTitle)
  printHelp.appendChild(helpLinks)

  const closeFn = () => {
    printModal.classList.remove('pe-open')
    setTimeout(() => { printModal?.remove(); printModal = null }, 300)
  }
  closeBtn.addEventListener('click', closeFn)
  backdrop.addEventListener('click', closeFn)

  exportBtn.addEventListener('click', () => {
    generatePrintFile(imageDataUrl, POSTER_SIZES[selectedIdx], exportBtn)
  })

  panel.appendChild(closeBtn)
  panel.appendChild(title)
  panel.appendChild(sub)
  panel.appendChild(sizesGrid)
  panel.appendChild(info)
  panel.appendChild(exportBtn)
  panel.appendChild(printHelp)

  printModal.appendChild(backdrop)
  printModal.appendChild(panel)

  document.body.appendChild(printModal)
  requestAnimationFrame(() => printModal.classList.add('pe-open'))
}

async function generatePrintFile(imageDataUrl, size, btn) {
  if (btn) { btn.textContent = 'Generating...'; btn.disabled = true }

  try {
    const totalW = Math.round((size.widthIn + BLEED_IN * 2) * DPI)
    const totalH = Math.round((size.heightIn + BLEED_IN * 2) * DPI)
    const bleedPx = Math.round(BLEED_IN * DPI)

    const canvas = document.createElement('canvas')
    canvas.width = totalW
    canvas.height = totalH
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, totalW, totalH)

    const img = await loadImage(imageDataUrl)
    const trimW = totalW - bleedPx * 2
    const trimH = totalH - bleedPx * 2

    const imgAspect = img.width / img.height
    const trimAspect = trimW / trimH
    let sx, sy, sw, sh
    if (imgAspect > trimAspect) {
      sh = img.height
      sw = img.height * trimAspect
      sx = (img.width - sw) / 2
      sy = 0
    } else {
      sw = img.width
      sh = img.width / trimAspect
      sx = 0
      sy = (img.height - sh) / 2
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, totalW, totalH)

    drawCropMarks(ctx, bleedPx, totalW, totalH)

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = `mapposter-print-${size.label.replace(/[\u00d7"]/g, '')}-${DPI}dpi.png`
    link.href = url
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)

    if (btn) { btn.textContent = 'Downloaded!'; setTimeout(() => { btn.textContent = 'Export Print-Ready File'; btn.disabled = false }, 2000) }
  } catch (e) {
    console.error('[print-export]', e)
    if (btn) { btn.textContent = 'Export failed'; btn.disabled = false }
  }
}

function drawCropMarks(ctx, bleed, w, h) {
  const markLen = Math.round(bleed * 0.8)
  const markOffset = Math.round(bleed * 0.15)
  ctx.save()
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1

  const corners = [
    [bleed, bleed],
    [w - bleed, bleed],
    [bleed, h - bleed],
    [w - bleed, h - bleed],
  ]

  corners.forEach(([cx, cy]) => {
    const hDir = cx < w / 2 ? -1 : 1
    ctx.beginPath()
    ctx.moveTo(cx + hDir * markOffset, cy)
    ctx.lineTo(cx + hDir * (markOffset + markLen), cy)
    ctx.stroke()

    const vDir = cy < h / 2 ? -1 : 1
    ctx.beginPath()
    ctx.moveTo(cx, cy + vDir * markOffset)
    ctx.lineTo(cx, cy + vDir * (markOffset + markLen))
    ctx.stroke()
  })

  ctx.restore()
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// CSS
const style = document.createElement('style')
style.textContent = `
  #print-export-modal {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 10002;
    align-items: center;
    justify-content: center;
  }
  #print-export-modal.pe-open { display: flex; }
  .pe-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(6, 5, 8, 0.7);
    backdrop-filter: blur(8px);
  }
  .pe-panel {
    position: relative;
    width: 420px;
    max-width: 90vw;
    max-height: 90vh;
    overflow-y: auto;
    background: rgba(28, 27, 31, 0.96);
    backdrop-filter: blur(40px);
    border: 0.5px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 32px;
    box-shadow: 0 40px 80px rgba(0,0,0,0.5), inset 0 0.5px 0 rgba(255,255,255,0.08);
    color: #eceae3;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
  }
  .pe-close {
    position: absolute;
    top: 14px;
    right: 16px;
    background: none;
    border: none;
    color: rgba(236,234,227,0.4);
    font-size: 20px;
    cursor: pointer;
  }
  .pe-close:hover { color: rgba(236,234,227,0.8); }
  .pe-title {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 20px;
    font-weight: 300;
    margin-bottom: 6px;
  }
  .pe-sub {
    font-size: 12px;
    color: rgba(236,234,227,0.5);
    margin-bottom: 20px;
    line-height: 1.5;
  }
  .pe-sizes {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-bottom: 20px;
  }
  .pe-size {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 14px 8px;
    background: rgba(255,255,255,0.03);
    border: 0.5px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
    color: inherit;
  }
  .pe-size:hover { border-color: rgba(255,255,255,0.15); }
  .pe-size.active {
    border-color: #c8b897;
    box-shadow: inset 0 0 0 0.5px #c8b897;
  }
  .pe-size-label { font-size: 14px; font-weight: 500; }
  .pe-size-dim { font-size: 10px; color: rgba(236,234,227,0.5); }
  .pe-size-px { font-size: 9px; color: rgba(236,234,227,0.3); font-family: 'SF Mono', monospace; }
  .pe-info {
    background: rgba(255,255,255,0.03);
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 20px;
  }
  .pe-info-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: rgba(236,234,227,0.5);
    padding: 3px 0;
  }
  .pe-export-btn {
    width: 100%;
    padding: 12px;
    background: rgba(200, 184, 151, 0.2);
    border: 0.5px solid rgba(200, 184, 151, 0.4);
    color: #c8b897;
    font-size: 14px;
    border-radius: 10px;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }
  .pe-export-btn:hover { background: rgba(200, 184, 151, 0.3); }
  .pe-export-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .pe-print-help {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 0.5px solid rgba(255,255,255,0.05);
  }
  .pe-help-title {
    font-size: 11px;
    color: rgba(236,234,227,0.4);
    letter-spacing: 0.06em;
    margin-bottom: 6px;
  }
  .pe-help-links {
    font-size: 11px;
    color: rgba(236,234,227,0.35);
    line-height: 1.5;
  }
`
document.head.appendChild(style)
