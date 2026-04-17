// ─── Camera Undo / Redo ─────────────────────────────────────
// Saves camera state snapshots and lets the user step back/forward.
// Snapshots are taken on significant movements (debounced).

const MAX_HISTORY = 50
const DEBOUNCE_MS = 800

let history = []
let historyIdx = -1
let lastSnapshot = null
let debounceTimer = null
let cameraRef = null

function cameraState(camera) {
  return {
    px: camera.position.x, py: camera.position.y, pz: camera.position.z,
    qx: camera.quaternion.x, qy: camera.quaternion.y,
    qz: camera.quaternion.z, qw: camera.quaternion.w,
    fov: camera.fov,
  }
}

function statesEqual(a, b) {
  if (!a || !b) return false
  const eps = 0.001
  return Math.abs(a.px - b.px) < eps &&
    Math.abs(a.py - b.py) < eps &&
    Math.abs(a.pz - b.pz) < eps &&
    Math.abs(a.qx - b.qx) < eps &&
    Math.abs(a.qy - b.qy) < eps &&
    Math.abs(a.qz - b.qz) < eps &&
    Math.abs(a.qw - b.qw) < eps
}

function pushState(cam) {
  const s = cameraState(cam)
  if (statesEqual(s, lastSnapshot)) return
  // Trim forward history if we've gone back
  if (historyIdx < history.length - 1) {
    history = history.slice(0, historyIdx + 1)
  }
  history.push(s)
  if (history.length > MAX_HISTORY) history.shift()
  historyIdx = history.length - 1
  lastSnapshot = s
  updateButtons()
}

function applyState(cam, s) {
  cam.position.set(s.px, s.py, s.pz)
  cam.quaternion.set(s.qx, s.qy, s.qz, s.qw)
  if (s.fov && cam.fov !== s.fov) {
    cam.fov = s.fov
    cam.updateProjectionMatrix()
  }
  lastSnapshot = s
}

export function undo() {
  if (historyIdx <= 0 || !cameraRef) return false
  historyIdx--
  applyState(cameraRef, history[historyIdx])
  updateButtons()
  return true
}

export function redo() {
  if (historyIdx >= history.length - 1 || !cameraRef) return false
  historyIdx++
  applyState(cameraRef, history[historyIdx])
  updateButtons()
  return true
}

export function canUndo() { return historyIdx > 0 }
export function canRedo() { return historyIdx < history.length - 1 }

// Called from useFrame — debounced snapshot
export function trackCamera(camera) {
  cameraRef = camera
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => pushState(camera), DEBOUNCE_MS)
}

// Take an initial snapshot. `camera` is optional — the poster-v3-ui
// bootstrap calls this before R3F has mounted and the camera ref
// exists, so we gracefully no-op the snapshot and let `trackCamera`
// (fired from useFrame once the canvas renders) backfill it.
export function initCameraHistory(camera) {
  if (camera) {
    cameraRef = camera
    pushState(camera)
  }
  addButtons()
  addKeyListeners()
}

// UI
let undoBtn = null
let redoBtn = null

function updateButtons() {
  if (undoBtn) {
    undoBtn.disabled = !canUndo()
    undoBtn.style.opacity = canUndo() ? '1' : '0.3'
  }
  if (redoBtn) {
    redoBtn.disabled = !canRedo()
    redoBtn.style.opacity = canRedo() ? '1' : '0.3'
  }
}

function addButtons() {
  const hud = document.querySelector('.canvas-hud')
  if (!hud) return

  const wrap = document.createElement('div')
  wrap.className = 'undo-redo-wrap'

  undoBtn = document.createElement('button')
  undoBtn.className = 'undo-redo-btn'
  undoBtn.type = 'button'
  undoBtn.title = 'Undo camera (Ctrl+Z)'
  undoBtn.textContent = '\u21B6'
  undoBtn.addEventListener('click', undo)

  redoBtn = document.createElement('button')
  redoBtn.className = 'undo-redo-btn'
  redoBtn.type = 'button'
  redoBtn.title = 'Redo camera (Ctrl+Shift+Z)'
  redoBtn.textContent = '\u21B7'
  redoBtn.addEventListener('click', redo)

  wrap.appendChild(undoBtn)
  wrap.appendChild(redoBtn)
  hud.appendChild(wrap)
  updateButtons()
}

function addKeyListeners() {
  document.addEventListener('keydown', (e) => {
    // Only handle when no input is focused
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    const isMod = e.metaKey || e.ctrlKey
    if (isMod && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
    } else if (isMod && e.key === 'z' && e.shiftKey) {
      e.preventDefault()
      redo()
    } else if (isMod && e.key === 'y') {
      e.preventDefault()
      redo()
    }
  })
}

// CSS
const style = document.createElement('style')
style.textContent = `
  .undo-redo-wrap {
    display: flex;
    gap: 4px;
    margin-left: 12px;
  }
  .undo-redo-btn {
    background: rgba(20, 19, 23, 0.55);
    backdrop-filter: blur(12px);
    border: 0.5px solid rgba(255, 255, 255, 0.08);
    border-radius: 5px;
    color: var(--ink-soft, rgba(236,234,227,0.62));
    font-size: 13px;
    width: 26px;
    height: 22px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    padding: 0;
    font-family: inherit;
  }
  .undo-redo-btn:hover:not(:disabled) {
    background: rgba(30, 29, 33, 0.75);
    color: var(--ink, #eceae3);
  }
  .undo-redo-btn:disabled {
    cursor: default;
  }
`
document.head.appendChild(style)
