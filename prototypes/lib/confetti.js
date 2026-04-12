// Lightweight confetti burst — fires once on export
const COLORS = ['#c8b897', '#e8e4dc', '#d4a574', '#8fb896', '#7ba4c8', '#c47a8a']
const COUNT = 60
const GRAVITY = 0.003

let running = false

export function fireConfetti() {
  if (running) return
  running = true

  const canvas = document.createElement('canvas')
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', zIndex: '9999',
    pointerEvents: 'none', width: '100vw', height: '100vh',
  })
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')

  const pieces = Array.from({ length: COUNT }, () => ({
    x: canvas.width * 0.5 + (Math.random() - 0.5) * 200,
    y: canvas.height * 0.5,
    vx: (Math.random() - 0.5) * 16,
    vy: -Math.random() * 14 - 4,
    size: Math.random() * 6 + 3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rotation: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 12,
    opacity: 1,
  }))

  let frame = 0
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    let alive = false
    for (const p of pieces) {
      p.x += p.vx
      p.vy += GRAVITY * frame
      p.y += p.vy
      p.rotation += p.rotSpeed
      p.opacity = Math.max(0, 1 - frame / 120)
      if (p.opacity <= 0) continue
      alive = true
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rotation * Math.PI / 180)
      ctx.globalAlpha = p.opacity
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx.restore()
    }
    frame++
    if (alive && frame < 150) {
      requestAnimationFrame(tick)
    } else {
      canvas.remove()
      running = false
    }
  }
  requestAnimationFrame(tick)
}
