// ─── Poster Room Mockup Generator ───────────────────────────
// After export, show the poster in different room/frame mockup scenes,
// like print-on-demand sites show their products.
// Pure canvas 2D rendering — no dependencies.

const MOCKUP_SCENES = {
  living: {
    name: 'Living Room',
    bg: '#e8e2d8',      // warm cream wall
    wallGrad: ['#f0ebe2', '#ddd6ca'],
    floor: '#c4b8a8',
    floorGrad: ['#c4b8a8', '#b0a494'],
    shadow: 'rgba(0,0,0,0.15)',
    frameColor: '#1a1a1a',
    matColor: '#f5f0e8',
    // Furniture hints
    furniture: 'sofa',
    ambient: 'warm',
  },
  office: {
    name: 'Office',
    bg: '#f0f0ee',
    wallGrad: ['#f5f5f2', '#e8e8e4'],
    floor: '#d4cfc8',
    floorGrad: ['#d4cfc8', '#c8c2b8'],
    shadow: 'rgba(0,0,0,0.12)',
    frameColor: '#2a2a2a',
    matColor: '#ffffff',
    furniture: 'desk',
    ambient: 'neutral',
  },
  gallery: {
    name: 'Gallery Wall',
    bg: '#ffffff',
    wallGrad: ['#ffffff', '#f5f5f5'],
    floor: '#e0ddd8',
    floorGrad: ['#e0ddd8', '#d0ccc4'],
    shadow: 'rgba(0,0,0,0.1)',
    frameColor: '#f0ece4',  // light wood frame
    matColor: '#ffffff',
    furniture: 'none',
    ambient: 'gallery',
  },
  bedroom: {
    name: 'Bedroom',
    bg: '#e4ddd4',
    wallGrad: ['#ece6dc', '#ddd6ca'],
    floor: '#c0b8ac',
    floorGrad: ['#c0b8ac', '#b0a898'],
    shadow: 'rgba(0,0,0,0.18)',
    frameColor: '#8a7a68', // warm wood
    matColor: '#f0ece4',
    furniture: 'bed',
    ambient: 'warm',
  },
}

let currentScene = 'living'
let posterImageUrl = null

export function initMockup() {
  const overlay = document.getElementById('mockup-overlay')
  const canvas = document.getElementById('mockup-canvas')
  const closeBtn = document.getElementById('mockup-close')
  const downloadBtn = document.getElementById('mockup-download')
  const mockupBtn = document.getElementById('mockup-btn')

  if (!overlay || !canvas) return

  // Open mockup
  mockupBtn?.addEventListener('click', async () => {
    // Capture current poster
    const r3fCanvas = document.querySelector('#r3f-root canvas')
    if (!r3fCanvas) return
    posterImageUrl = r3fCanvas.toDataURL('image/png')
    currentScene = 'living'
    overlay.classList.add('open')
    updateTabActive()
    renderMockup()
  })

  // Close
  closeBtn?.addEventListener('click', () => {
    overlay.classList.remove('open')
  })
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open')
  })

  // Scene tabs
  document.querySelectorAll('[data-mockup]').forEach(tab => {
    tab.addEventListener('click', () => {
      currentScene = tab.dataset.mockup
      updateTabActive()
      renderMockup()
    })
  })

  // Download
  downloadBtn?.addEventListener('click', () => {
    if (!canvas) return
    const link = document.createElement('a')
    link.download = 'mapposter-mockup-' + currentScene + '.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  })

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) {
      overlay.classList.remove('open')
    }
  })
}

function updateTabActive() {
  document.querySelectorAll('[data-mockup]').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mockup === currentScene)
  })
}

function renderMockup() {
  const canvas = document.getElementById('mockup-canvas')
  if (!canvas || !posterImageUrl) return

  const scene = MOCKUP_SCENES[currentScene]
  if (!scene) return

  const img = new Image()
  img.onload = () => drawScene(canvas, img, scene)
  img.src = posterImageUrl
}

function drawScene(canvas, posterImg, scene) {
  const W = 1200
  const H = 900
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // ── Wall background ──
  const wallGrad = ctx.createLinearGradient(0, 0, 0, H * 0.72)
  wallGrad.addColorStop(0, scene.wallGrad[0])
  wallGrad.addColorStop(1, scene.wallGrad[1])
  ctx.fillStyle = wallGrad
  ctx.fillRect(0, 0, W, H * 0.72)

  // Wall texture (subtle noise)
  ctx.globalAlpha = 0.03
  for (let i = 0; i < 2000; i++) {
    const x = Math.random() * W
    const y = Math.random() * H * 0.72
    ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff'
    ctx.fillRect(x, y, 1, 1)
  }
  ctx.globalAlpha = 1

  // ── Floor ──
  const floorY = H * 0.72
  const floorGrad = ctx.createLinearGradient(0, floorY, 0, H)
  floorGrad.addColorStop(0, scene.floorGrad[0])
  floorGrad.addColorStop(1, scene.floorGrad[1])
  ctx.fillStyle = floorGrad
  ctx.fillRect(0, floorY, W, H - floorY)

  // Floor line
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, floorY)
  ctx.lineTo(W, floorY)
  ctx.stroke()

  // ── Poster frame ──
  const posterAspect = posterImg.width / posterImg.height
  const maxPosterH = H * 0.52
  const maxPosterW = W * 0.35
  let posterW, posterH

  if (posterAspect > 1) {
    posterW = Math.min(maxPosterW * 1.2, maxPosterH * posterAspect)
    posterH = posterW / posterAspect
  } else {
    posterH = maxPosterH
    posterW = posterH * posterAspect
  }

  const frameThickness = 12
  const matThickness = 24
  const totalW = posterW + (frameThickness + matThickness) * 2
  const totalH = posterH + (frameThickness + matThickness) * 2

  const frameX = W / 2 - totalW / 2
  const frameY = floorY * 0.45 - totalH / 2

  // Frame shadow on wall
  ctx.save()
  ctx.shadowColor = scene.shadow
  ctx.shadowBlur = 30
  ctx.shadowOffsetX = 4
  ctx.shadowOffsetY = 8
  ctx.fillStyle = scene.frameColor
  ctx.fillRect(frameX, frameY, totalW, totalH)
  ctx.restore()

  // Frame border
  ctx.fillStyle = scene.frameColor
  ctx.fillRect(frameX, frameY, totalW, totalH)

  // Frame inner bevel (light top/left, dark bottom/right)
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fillRect(frameX, frameY, totalW, 2)
  ctx.fillRect(frameX, frameY, 2, totalH)
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.fillRect(frameX, frameY + totalH - 2, totalW, 2)
  ctx.fillRect(frameX + totalW - 2, frameY, 2, totalH)

  // Mat
  const matX = frameX + frameThickness
  const matY = frameY + frameThickness
  const matW = totalW - frameThickness * 2
  const matH = totalH - frameThickness * 2
  ctx.fillStyle = scene.matColor
  ctx.fillRect(matX, matY, matW, matH)

  // Mat inner shadow (AO where poster meets mat)
  ctx.save()
  const matInnerX = matX + matThickness
  const matInnerY = matY + matThickness

  // Subtle inner shadow on mat
  ctx.shadowColor = 'rgba(0,0,0,0.08)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 1
  ctx.fillStyle = 'transparent'
  ctx.fillRect(matInnerX, matInnerY, posterW, posterH)
  ctx.restore()

  // Poster image
  ctx.drawImage(posterImg, matInnerX, matInnerY, posterW, posterH)

  // Glass reflection (subtle gradient overlay)
  const glassGrad = ctx.createLinearGradient(frameX, frameY, frameX + totalW * 0.7, frameY + totalH)
  glassGrad.addColorStop(0, 'rgba(255,255,255,0.06)')
  glassGrad.addColorStop(0.3, 'rgba(255,255,255,0)')
  glassGrad.addColorStop(0.7, 'rgba(255,255,255,0)')
  glassGrad.addColorStop(1, 'rgba(255,255,255,0.03)')
  ctx.fillStyle = glassGrad
  ctx.fillRect(frameX, frameY, totalW, totalH)

  // ── Furniture hints ──
  drawFurniture(ctx, scene, W, H, floorY, frameX, totalW)

  // ── Ambient lighting ──
  if (scene.ambient === 'warm') {
    const lightGrad = ctx.createRadialGradient(W * 0.5, 0, 0, W * 0.5, 0, H * 0.8)
    lightGrad.addColorStop(0, 'rgba(255,240,220,0.04)')
    lightGrad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = lightGrad
    ctx.fillRect(0, 0, W, H)
  } else if (scene.ambient === 'gallery') {
    // Spot light effect from above
    const spotGrad = ctx.createRadialGradient(W / 2, frameY - 60, 20, W / 2, frameY + totalH / 2, totalW * 0.6)
    spotGrad.addColorStop(0, 'rgba(255,252,245,0.12)')
    spotGrad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = spotGrad
    ctx.fillRect(0, 0, W, H)
  }
}

function drawFurniture(ctx, scene, W, H, floorY, frameX, frameW) {
  ctx.save()

  if (scene.furniture === 'sofa') {
    // Simple sofa silhouette below poster
    const sofaW = 400
    const sofaH = 100
    const sofaX = W / 2 - sofaW / 2
    const sofaY = floorY - sofaH * 0.2

    // Sofa back
    ctx.fillStyle = 'rgba(80,75,65,0.15)'
    roundRect(ctx, sofaX, sofaY - 40, sofaW, 50, 8)
    ctx.fill()

    // Sofa seat
    ctx.fillStyle = 'rgba(80,75,65,0.2)'
    roundRect(ctx, sofaX - 10, sofaY, sofaW + 20, sofaH * 0.5, 6)
    ctx.fill()

    // Cushions
    ctx.fillStyle = 'rgba(180,170,155,0.15)'
    roundRect(ctx, sofaX + 20, sofaY - 30, 60, 40, 4)
    ctx.fill()
    roundRect(ctx, sofaX + sofaW - 80, sofaY - 30, 60, 40, 4)
    ctx.fill()
  }

  if (scene.furniture === 'desk') {
    // Simple desk surface
    const deskW = 300
    const deskH = 20
    const deskX = W / 2 - deskW / 2
    const deskY = floorY - 60

    ctx.fillStyle = 'rgba(160,150,135,0.2)'
    ctx.fillRect(deskX, deskY, deskW, deskH)

    // Monitor hint
    ctx.fillStyle = 'rgba(40,40,45,0.15)'
    roundRect(ctx, deskX + 80, deskY - 90, 140, 85, 4)
    ctx.fill()

    // Desk lamp hint
    ctx.fillStyle = 'rgba(100,95,85,0.12)'
    ctx.beginPath()
    ctx.arc(deskX + deskW - 40, deskY - 30, 20, 0, Math.PI * 2)
    ctx.fill()
  }

  if (scene.furniture === 'bed') {
    // Bed headboard hint
    const bedW = 500
    const bedX = W / 2 - bedW / 2
    const bedY = floorY - 30

    ctx.fillStyle = 'rgba(160,148,130,0.18)'
    roundRect(ctx, bedX, bedY - 80, bedW, 90, 6)
    ctx.fill()

    // Pillows
    ctx.fillStyle = 'rgba(220,215,205,0.2)'
    roundRect(ctx, bedX + 40, bedY - 65, 120, 45, 8)
    ctx.fill()
    roundRect(ctx, bedX + bedW - 160, bedY - 65, 120, 45, 8)
    ctx.fill()

    // Bedding
    ctx.fillStyle = 'rgba(180,170,155,0.12)'
    roundRect(ctx, bedX - 20, bedY, bedW + 40, 50, 4)
    ctx.fill()
  }

  ctx.restore()
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// Allow external trigger (e.g. after AI export completes)
export function openMockupWithImage(imageUrl) {
  posterImageUrl = imageUrl
  currentScene = 'living'
  const overlay = document.getElementById('mockup-overlay')
  if (overlay) {
    overlay.classList.add('open')
    updateTabActive()
    renderMockup()
  }
}
