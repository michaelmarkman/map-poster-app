// ─── Freeform Editor Overlay ────────────────────────────────
// Canva-style graphic editor layered on top of the 3D map poster.
// Uses Fabric.js v7 for canvas interactions (select, drag, resize, rotate).
// Fully imperative — no React, matches the rest of the codebase.

import { Canvas, Rect, Circle, Textbox, Line, Triangle, Path, FabricImage, Group } from 'fabric'

// ─── State ──────────────────────────────────────────────────
const EDITOR_STORAGE_KEY = 'mapposter3d_editor_state'
const TEMPLATES_STORAGE_KEY = 'mapposter3d_editor_templates'

let fabricCanvas = null
let editorActive = false
let selectedObject = null

// Undo/redo
const history = []
let historyIndex = -1
const MAX_HISTORY = 50
let _skipHistory = false

// ─── Snap guides ────────────────────────────────────────────
let snapLines = []
const SNAP_IN = 6   // distance at which a fresh snap engages
const SNAP_OUT = 18 // distance at which an existing snap releases — hysteresis
                    // gap stops the "snap → unsnap → snap" jitter loop where the
                    // cursor lives just inside the original threshold.
// Tracks which axes the active drag is currently snapped to so we can apply
// hysteresis. Reset on mouse:up.
const snapState = { x: null, y: null }

function clearSnapLines() {
  snapLines.forEach(l => fabricCanvas.remove(l))
  snapLines = []
}

function resetSnap() {
  clearSnapLines()
  snapState.x = null
  snapState.y = null
  if (fabricCanvas) fabricCanvas.renderAll()
}

function addSnapLine(x1, y1, x2, y2) {
  const line = new Line([x1, y1, x2, y2], {
    stroke: '#c4956a',
    strokeWidth: 1,
    strokeDashArray: [4, 4],
    selectable: false,
    evented: false,
    excludeFromExport: true,
    opacity: 0.6
  })
  fabricCanvas.add(line)
  snapLines.push(line)
}

// Pick the snap target for one axis with hysteresis. `current` is the
// active snap key from snapState; `candidates` is [{ key, delta }] sorted
// by absolute delta. Returns the chosen key or null. Uses SNAP_IN to engage
// a new snap and SNAP_OUT to release an existing one.
function pickSnap(current, candidates) {
  if (current) {
    const stillNear = candidates.find((c) => c.key === current)
    if (stillNear && Math.abs(stillNear.delta) < SNAP_OUT) return current
  }
  const fresh = candidates[0]
  if (fresh && Math.abs(fresh.delta) < SNAP_IN) return fresh.key
  return null
}

function snapObject(target) {
  clearSnapLines()
  if (!target) return
  const cw = fabricCanvas.width, ch = fabricCanvas.height
  const cx = cw / 2, cy = ch / 2
  const bound = target.getBoundingRect()
  const objCx = bound.left + bound.width / 2
  const objCy = bound.top + bound.height / 2
  const objLeft = bound.left, objTop = bound.top
  const objRight = bound.left + bound.width, objBottom = bound.top + bound.height

  const xCandidates = [
    { key: 'cx',    delta: cx - objCx },
    { key: 'left',  delta: 0 - objLeft },
    { key: 'right', delta: cw - objRight },
  ].sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))

  const yCandidates = [
    { key: 'cy',     delta: cy - objCy },
    { key: 'top',    delta: 0 - objTop },
    { key: 'bottom', delta: ch - objBottom },
  ].sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))

  const xSnap = pickSnap(snapState.x, xCandidates)
  const ySnap = pickSnap(snapState.y, yCandidates)
  snapState.x = xSnap
  snapState.y = ySnap

  if (xSnap) {
    const c = xCandidates.find((c) => c.key === xSnap)
    target.set('left', target.left + c.delta)
    if (xSnap === 'cx') addSnapLine(cx, 0, cx, ch)
    else if (xSnap === 'left') addSnapLine(0, 0, 0, ch)
    else if (xSnap === 'right') addSnapLine(cw, 0, cw, ch)
  }
  if (ySnap) {
    const c = yCandidates.find((c) => c.key === ySnap)
    target.set('top', target.top + c.delta)
    if (ySnap === 'cy') addSnapLine(0, cy, cw, cy)
    else if (ySnap === 'top') addSnapLine(0, 0, cw, 0)
    else if (ySnap === 'bottom') addSnapLine(0, ch, cw, ch)
  }
}

// ─── Alignment helpers ──────────────────────────────────────
function alignSelected(alignment) {
  if (!selectedObject || !fabricCanvas) return
  const cw = fabricCanvas.width, ch = fabricCanvas.height
  const bound = selectedObject.getBoundingRect()
  switch (alignment) {
    case 'left': selectedObject.set('left', selectedObject.left - bound.left); break
    case 'center-h': selectedObject.set('left', selectedObject.left + (cw / 2 - (bound.left + bound.width / 2))); break
    case 'right': selectedObject.set('left', selectedObject.left + (cw - (bound.left + bound.width))); break
    case 'top': selectedObject.set('top', selectedObject.top - bound.top); break
    case 'center-v': selectedObject.set('top', selectedObject.top + (ch / 2 - (bound.top + bound.height / 2))); break
    case 'bottom': selectedObject.set('top', selectedObject.top + (ch - (bound.top + bound.height))); break
  }
  selectedObject.setCoords()
  fabricCanvas.renderAll()
  saveHistory(); persistState()
}

// ─── History (undo/redo) ────────────────────────────────────
function saveHistory() {
  if (_skipHistory) return
  const json = fabricCanvas.toJSON(['name', 'editorType', 'lockMovementX', 'lockMovementY', 'excludeFromExport'])
  // Remove snap guide lines
  json.objects = json.objects.filter(o => !o.excludeFromExport)
  historyIndex++
  history.splice(historyIndex, Infinity, JSON.stringify(json))
  if (history.length > MAX_HISTORY) {
    history.shift()
    historyIndex--
  }
}

function undo() {
  if (historyIndex <= 0) return
  historyIndex--
  loadFromHistory()
}

function redo() {
  if (historyIndex >= history.length - 1) return
  historyIndex++
  loadFromHistory()
}

async function loadFromHistory() {
  _skipHistory = true
  const json = JSON.parse(history[historyIndex])
  await fabricCanvas.loadFromJSON(json)
  fabricCanvas.renderAll()
  _skipHistory = false
  updatePropertiesPanel()
}

// ─── Init ───────────────────────────────────────────────────
export function initEditor() {
  const container = document.getElementById('canvas-container')
  if (!container) return

  // Create overlay canvas element
  const canvasEl = document.createElement('canvas')
  canvasEl.id = 'editor-canvas'
  canvasEl.style.cssText = 'position:absolute;inset:0;z-index:15;pointer-events:none;'
  container.appendChild(canvasEl)

  // Size to match container
  const rect = container.getBoundingClientRect()
  canvasEl.width = rect.width
  canvasEl.height = rect.height

  fabricCanvas = new Canvas(canvasEl, {
    selection: true,
    preserveObjectStacking: true,
    backgroundColor: 'transparent',
    controlsAboveOverlay: true,
  })

  // Transparent background
  fabricCanvas.backgroundColor = null
  fabricCanvas.renderAll()

  // Initially disabled — pointer-events:none on wrapper
  setEditorActive(false)

  // Listen to events
  fabricCanvas.on('object:modified', () => { saveHistory(); persistState() })
  fabricCanvas.on('object:added', () => { if (!_skipHistory) { saveHistory(); persistState() } })
  fabricCanvas.on('object:removed', () => { if (!_skipHistory) { saveHistory(); persistState() } })
  fabricCanvas.on('selection:created', (e) => { selectedObject = e.selected?.[0] || null; updatePropertiesPanel() })
  fabricCanvas.on('selection:updated', (e) => { selectedObject = e.selected?.[0] || null; updatePropertiesPanel() })
  fabricCanvas.on('selection:cleared', () => { selectedObject = null; updatePropertiesPanel() })
  fabricCanvas.on('object:moving', (e) => snapObject(e.target))
  fabricCanvas.on('object:moved', () => resetSnap())
  // mouse:up always fires when the pointer is released, even when no move
  // happened or the release lands outside any object — guarantees the
  // dashed guides clear instead of getting stranded on the canvas.
  fabricCanvas.on('mouse:up', () => resetSnap())
  fabricCanvas.on('selection:cleared', () => resetSnap())

  // ResizeObserver to keep canvas in sync
  const ro = new ResizeObserver(() => resizeCanvas())
  ro.observe(container)

  // Wire toolbar buttons
  wireToolbar()
  wirePropertiesPanel()
  wireTemplateUI()

  // Save initial empty state
  saveHistory()

  // Try restore saved state
  restoreState()
}

// Shared defaults applied to every new object
const fabric_defaults = {
  borderColor: '#c4956a',
  cornerColor: '#c4956a',
  cornerStrokeColor: '#0f0f12',
  cornerSize: 8,
  cornerStyle: 'circle',
  transparentCorners: false,
  borderScaleFactor: 1.5,
  padding: 4,
}

function resizeCanvas() {
  const container = document.getElementById('canvas-container')
  if (!container || !fabricCanvas) return
  const rect = container.getBoundingClientRect()
  fabricCanvas.setDimensions({ width: rect.width, height: rect.height })
  fabricCanvas.renderAll()
}

// ─── Toggle editor ──────────────────────────────────────────
export function setEditorActive(active) {
  editorActive = active
  const canvasEl = document.getElementById('editor-canvas')
  const toolbar = document.getElementById('editor-toolbar')
  const propsPanel = document.getElementById('editor-props')

  // Drop the active selection on deactivate — otherwise the selection
  // handles + bounding box stay painted on the canvas after exit.
  if (!active && fabricCanvas) {
    try {
      fabricCanvas.discardActiveObject()
      resetSnap()
      fabricCanvas.renderAll()
    } catch {}
  }

  // Fabric creates a wrapper div and upper-canvas — control pointer events on wrapper
  const wrapper = canvasEl?.parentElement?.querySelector('.canvas-container')
  if (wrapper) {
    wrapper.style.pointerEvents = active ? 'auto' : 'none'
  }
  // Also the upper canvas Fabric generates
  const upperCanvas = canvasEl?.parentElement?.querySelector('.upper-canvas')
  if (upperCanvas) {
    upperCanvas.style.pointerEvents = active ? 'auto' : 'none'
  }

  if (toolbar) toolbar.classList.toggle('active', active)
  if (propsPanel && !active) propsPanel.classList.remove('open')

  // Toggle button state
  const toggleBtn = document.getElementById('editor-toggle-btn')
  if (toggleBtn) {
    toggleBtn.textContent = active ? 'Exit Editor' : 'Open Editor'
    toggleBtn.style.background = active ? 'var(--copper)' : 'var(--bg-raised)'
    toggleBtn.style.color = active ? 'var(--bg-deep)' : 'var(--text-2)'
  }
}

export function isEditorActive() { return editorActive }

// ─── Add elements ───────────────────────────────────────────
function addText(text = 'Your Text', options = {}) {
  const cw = fabricCanvas.width, ch = fabricCanvas.height
  const t = new Textbox(text, {
    left: cw / 2 - 100,
    top: ch / 2 - 20,
    width: 200,
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 36,
    fill: '#e8e4dc',
    textAlign: 'center',
    editable: true,
    name: 'text',
    editorType: 'text',
    ...options,
    ...fabric_defaults,
  })
  fabricCanvas.add(t)
  fabricCanvas.setActiveObject(t)
  fabricCanvas.renderAll()
  return t
}

function addShape(type = 'rect', options = {}) {
  const cw = fabricCanvas.width, ch = fabricCanvas.height
  let shape
  const common = {
    left: cw / 2 - 50,
    top: ch / 2 - 50,
    fill: 'rgba(196,149,106,0.3)',
    stroke: '#c4956a',
    strokeWidth: 2,
    name: type,
    editorType: 'shape',
    ...fabric_defaults,
  }

  switch (type) {
    case 'circle':
      shape = new Circle({ ...common, radius: 50, ...options })
      break
    case 'line':
      shape = new Line([cw / 2 - 60, ch / 2, cw / 2 + 60, ch / 2], {
        ...common,
        fill: null,
        stroke: '#c4956a',
        strokeWidth: 3,
        ...options,
      })
      break
    case 'arrow': {
      const x1 = cw / 2 - 60, y1 = ch / 2, x2 = cw / 2 + 60, y2 = ch / 2
      const line = new Line([x1, y1, x2, y2], {
        stroke: '#c4956a', strokeWidth: 3, fill: null, selectable: false, evented: false,
      })
      const head = new Triangle({
        left: x2 - 6, top: y2 - 8,
        width: 16, height: 16,
        fill: '#c4956a',
        angle: 90,
        selectable: false, evented: false,
      })
      shape = new Group([line, head], {
        ...common,
        fill: null,
        name: 'arrow',
        ...options,
      })
      break
    }
    default: // rect
      shape = new Rect({ ...common, width: 100, height: 100, rx: 4, ry: 4, ...options })
  }

  if (shape) {
    fabricCanvas.add(shape)
    fabricCanvas.setActiveObject(shape)
    fabricCanvas.renderAll()
  }
  return shape
}

function addImage(url) {
  FabricImage.fromURL(url, { crossOrigin: 'anonymous' }).then(img => {
    if (!img) return
    const cw = fabricCanvas.width, ch = fabricCanvas.height
    const maxDim = Math.min(cw, ch) * 0.4
    const scale = maxDim / Math.max(img.width, img.height)
    img.set({
      left: cw / 2 - (img.width * scale) / 2,
      top: ch / 2 - (img.height * scale) / 2,
      scaleX: scale,
      scaleY: scale,
      name: 'image',
      editorType: 'image',
      ...fabric_defaults,
    })
    fabricCanvas.add(img)
    fabricCanvas.setActiveObject(img)
    fabricCanvas.renderAll()
  })
}

function addFrame(style = 'simple') {
  // Remove existing frame
  fabricCanvas.getObjects().forEach(o => {
    if (o.editorType === 'frame') fabricCanvas.remove(o)
  })

  const cw = fabricCanvas.width, ch = fabricCanvas.height
  const pad = 16
  const frames = {
    simple: { stroke: '#c4956a', strokeWidth: 2, rx: 0, ry: 0, fill: 'transparent', strokeDashArray: null },
    double: { stroke: '#c4956a', strokeWidth: 1, rx: 0, ry: 0, fill: 'transparent', strokeDashArray: null },
    dashed: { stroke: '#c4956a', strokeWidth: 2, rx: 0, ry: 0, fill: 'transparent', strokeDashArray: [12, 6] },
    rounded: { stroke: '#c4956a', strokeWidth: 2, rx: 12, ry: 12, fill: 'transparent', strokeDashArray: null },
    ornate: { stroke: '#e8e4dc', strokeWidth: 3, rx: 0, ry: 0, fill: 'transparent', strokeDashArray: null },
  }
  const cfg = frames[style] || frames.simple

  const rect = new Rect({
    left: pad,
    top: pad,
    width: cw - pad * 2,
    height: ch - pad * 2,
    ...cfg,
    selectable: true,
    evented: true,
    name: 'frame-' + style,
    editorType: 'frame',
    ...fabric_defaults,
  })

  if (style === 'double') {
    const inner = new Rect({
      left: pad + 6,
      top: pad + 6,
      width: cw - (pad + 6) * 2,
      height: ch - (pad + 6) * 2,
      stroke: '#c4956a',
      strokeWidth: 1,
      fill: 'transparent',
      selectable: false,
      evented: false,
    })
    const group = new Group([rect, inner], {
      left: pad,
      top: pad,
      name: 'frame-double',
      editorType: 'frame',
      ...fabric_defaults,
    })
    fabricCanvas.add(group)
    fabricCanvas.sendObjectToBack(group)
  } else {
    fabricCanvas.add(rect)
    fabricCanvas.sendObjectToBack(rect)
  }

  fabricCanvas.renderAll()
}

// ─── Built-in stickers (SVG paths) ─────────────────────────
const STICKERS = {
  pin: { path: 'M12 0C7.31 0 3.5 3.81 3.5 8.5C3.5 14.88 12 24 12 24S20.5 14.88 20.5 8.5C20.5 3.81 16.69 0 12 0ZM12 11.5C10.34 11.5 9 10.16 9 8.5S10.34 5.5 12 5.5S15 6.84 15 8.5S13.66 11.5 12 11.5Z', fill: '#c45a5a' },
  star: { path: 'M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z', fill: '#d4a24e' },
  heart: { path: 'M12 21.35L10.55 20.03C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5C22 12.28 18.6 15.36 13.45 20.03L12 21.35Z', fill: '#c45a5a' },
  compass: { path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5.5-2.5l7.51-3.49L17.5 6.5 9.99 9.99 6.5 17.5zm5.5-6.6c.61 0 1.1.49 1.1 1.1s-.49 1.1-1.1 1.1-1.1-.49-1.1-1.1.49-1.1 1.1-1.1z', fill: '#6b9b6e' },
  plane: { path: 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z', fill: '#6a9ab8' },
  camera: { path: 'M12 15.2A3.2 3.2 0 0 0 15.2 12 3.2 3.2 0 0 0 12 8.8 3.2 3.2 0 0 0 8.8 12 3.2 3.2 0 0 0 12 15.2M9 2L7.17 4H4A2 2 0 0 0 2 6V18A2 2 0 0 0 4 20H20A2 2 0 0 0 22 18V6A2 2 0 0 0 20 4H16.83L15 2H9Z', fill: '#908c84' },
}

function addSticker(name) {
  const sticker = STICKERS[name]
  if (!sticker) return
  const cw = fabricCanvas.width, ch = fabricCanvas.height
  const path = new Path(sticker.path, {
    left: cw / 2 - 24,
    top: ch / 2 - 24,
    fill: sticker.fill,
    scaleX: 2,
    scaleY: 2,
    name: 'sticker-' + name,
    editorType: 'sticker',
    ...fabric_defaults,
  })
  fabricCanvas.add(path)
  fabricCanvas.setActiveObject(path)
  fabricCanvas.renderAll()
}

// ─── Layer order ────────────────────────────────────────────
function bringToFront() { if (selectedObject) { fabricCanvas.bringObjectToFront(selectedObject); fabricCanvas.renderAll() } }
function sendToBack() { if (selectedObject) { fabricCanvas.sendObjectToBack(selectedObject); fabricCanvas.renderAll() } }
function duplicateSelected() {
  if (!selectedObject) return
  selectedObject.clone().then(cloned => {
    cloned.set({ left: cloned.left + 20, top: cloned.top + 20, ...fabric_defaults })
    fabricCanvas.add(cloned)
    fabricCanvas.setActiveObject(cloned)
    fabricCanvas.renderAll()
  })
}
function deleteSelected() {
  if (!selectedObject) return
  fabricCanvas.remove(selectedObject)
  selectedObject = null
  updatePropertiesPanel()
  fabricCanvas.renderAll()
}

// ─── Toolbar wiring ─────────────────────────────────────────
function wireToolbar() {
  // Toggle editor
  document.getElementById('editor-toggle-btn')?.addEventListener('click', () => {
    setEditorActive(!editorActive)
  })

  // Text tool
  document.getElementById('ed-tool-text')?.addEventListener('click', () => {
    if (!editorActive) setEditorActive(true)
    addText()
  })

  // Shape tools
  document.getElementById('ed-tool-rect')?.addEventListener('click', () => {
    if (!editorActive) setEditorActive(true)
    addShape('rect')
  })
  document.getElementById('ed-tool-circle')?.addEventListener('click', () => {
    if (!editorActive) setEditorActive(true)
    addShape('circle')
  })
  document.getElementById('ed-tool-line')?.addEventListener('click', () => {
    if (!editorActive) setEditorActive(true)
    addShape('line')
  })
  document.getElementById('ed-tool-arrow')?.addEventListener('click', () => {
    if (!editorActive) setEditorActive(true)
    addShape('arrow')
  })

  // Image upload
  const imgInput = document.getElementById('ed-img-input')
  document.getElementById('ed-tool-image')?.addEventListener('click', () => {
    if (!editorActive) setEditorActive(true)
    imgInput?.click()
  })
  imgInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => addImage(ev.target.result)
    reader.readAsDataURL(file)
    imgInput.value = ''
  })

  // Stickers
  document.querySelectorAll('[data-sticker]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!editorActive) setEditorActive(true)
      addSticker(btn.dataset.sticker)
    })
  })

  // Frame
  document.querySelectorAll('[data-frame]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!editorActive) setEditorActive(true)
      addFrame(btn.dataset.frame)
    })
  })

  // Delete
  document.getElementById('ed-tool-delete')?.addEventListener('click', deleteSelected)

  // Undo/redo
  document.getElementById('ed-tool-undo')?.addEventListener('click', undo)
  document.getElementById('ed-tool-redo')?.addEventListener('click', redo)

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (!editorActive) return
    // Don't intercept when editing text in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
    if (fabricCanvas.getActiveObject()?.isEditing) return

    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); e.preventDefault() }
    if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) { undo(); e.preventDefault() }
    if (e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) { redo(); e.preventDefault() }
    if (e.key === 'y' && (e.metaKey || e.ctrlKey)) { redo(); e.preventDefault() }
    if (e.key === 'd' && (e.metaKey || e.ctrlKey)) { duplicateSelected(); e.preventDefault() }
    if (e.key === 'Escape') { fabricCanvas.discardActiveObject(); fabricCanvas.renderAll() }
  })
}

// ─── Properties panel ───────────────────────────────────────
function updatePropertiesPanel() {
  const panel = document.getElementById('editor-props')
  const content = document.getElementById('editor-props-content')
  if (!panel || !content) return

  if (!selectedObject) {
    panel.classList.remove('open')
    return
  }
  panel.classList.add('open')

  const obj = selectedObject
  const type = obj.editorType || obj.type

  // Build DOM safely instead of innerHTML
  while (content.firstChild) content.removeChild(content.firstChild)

  // Section title
  const sectionTitle = document.createElement('div')
  sectionTitle.className = 'ep-section-title'
  sectionTitle.textContent = (type || 'element').toUpperCase()
  content.appendChild(sectionTitle)

  // Position row
  content.appendChild(buildRow('X', 'number', 'left', Math.round(obj.left || 0)))
  content.appendChild(buildRow('Y', 'number', 'top', Math.round(obj.top || 0)))

  // Opacity
  content.appendChild(buildSliderRow('Opacity', 'opacity', 0, 1, 0.05, obj.opacity ?? 1, v => Math.round(v * 100) + '%'))

  // Rotation
  content.appendChild(buildSliderRow('Rotation', 'angle', 0, 360, 1, Math.round(obj.angle || 0), v => Math.round(v) + '\u00b0'))

  // Type-specific properties
  if (type === 'text' || obj.type === 'textbox' || obj.type === 'i-text') {
    appendTextProperties(content, obj)
  } else if (type === 'shape' || type === 'frame' || obj.type === 'rect' || obj.type === 'circle' || obj.type === 'line') {
    appendShapeProperties(content, obj)
  }

  // Alignment section
  const alignTitle = document.createElement('div')
  alignTitle.className = 'ep-section-title'
  alignTitle.style.marginTop = '10px'
  alignTitle.textContent = 'ALIGN'
  content.appendChild(alignTitle)

  const alignRow = document.createElement('div')
  alignRow.className = 'ep-row ep-actions'
  const aligns = [
    { label: '⫷', title: 'Align left', key: 'left' },
    { label: '⫿', title: 'Center horizontal', key: 'center-h' },
    { label: '⫸', title: 'Align right', key: 'right' },
    { label: '⫠', title: 'Align top', key: 'top' },
    { label: '⫟', title: 'Center vertical', key: 'center-v' },
    { label: '⫡', title: 'Align bottom', key: 'bottom' },
  ]
  aligns.forEach(a => {
    const btn = document.createElement('button')
    btn.className = 'ep-btn'
    btn.textContent = a.label
    btn.title = a.title
    btn.addEventListener('click', () => alignSelected(a.key))
    alignRow.appendChild(btn)
  })
  content.appendChild(alignRow)

  // Layer controls section title
  const layerTitle = document.createElement('div')
  layerTitle.className = 'ep-section-title'
  layerTitle.style.marginTop = '10px'
  layerTitle.textContent = 'LAYER'
  content.appendChild(layerTitle)

  const actionsRow = document.createElement('div')
  actionsRow.className = 'ep-row ep-actions'
  const actions = [
    { label: '\u21e7 Front', handler: bringToFront },
    { label: '\u21e9 Back', handler: sendToBack },
    { label: '\u29c9 Dup', handler: duplicateSelected },
    { label: '\u2715 Delete', handler: deleteSelected, danger: true },
  ]
  actions.forEach(a => {
    const btn = document.createElement('button')
    btn.className = 'ep-btn' + (a.danger ? ' ep-btn-danger' : '')
    btn.textContent = a.label
    btn.addEventListener('click', a.handler)
    actionsRow.appendChild(btn)
  })
  content.appendChild(actionsRow)

  // Layers list
  const layersListTitle = document.createElement('div')
  layersListTitle.className = 'ep-section-title'
  layersListTitle.style.marginTop = '10px'
  layersListTitle.textContent = 'ALL LAYERS'
  content.appendChild(layersListTitle)

  const layersList = document.createElement('div')
  layersList.className = 'ep-layers-list'
  const objects = fabricCanvas.getObjects().filter(o => !o.excludeFromExport)
  objects.slice().reverse().forEach((o, i) => {
    const item = document.createElement('div')
    item.className = 'ep-layer-item' + (o === selectedObject ? ' active' : '')
    const label = o.name || o.editorType || o.type || 'Object'
    const preview = o.type === 'textbox' ? (o.text || '').substring(0, 16) : label

    const nameSpan = document.createElement('span')
    nameSpan.className = 'ep-layer-name'
    nameSpan.textContent = preview
    item.appendChild(nameSpan)

    const visBtn = document.createElement('button')
    visBtn.className = 'ep-layer-vis'
    visBtn.textContent = o.visible === false ? '◻' : '◼'
    visBtn.title = 'Toggle visibility'
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      o.set('visible', o.visible === false ? true : false)
      fabricCanvas.renderAll()
      persistState()
      updatePropertiesPanel()
    })
    item.appendChild(visBtn)

    item.addEventListener('click', () => {
      fabricCanvas.setActiveObject(o)
      fabricCanvas.renderAll()
    })
    layersList.appendChild(item)
  })
  content.appendChild(layersList)
}

// Safe DOM builder helpers for properties panel
function buildRow(label, inputType, prop, value) {
  const row = document.createElement('div')
  row.className = 'ep-row'
  const lbl = document.createElement('label')
  lbl.textContent = label
  row.appendChild(lbl)
  const input = document.createElement('input')
  input.type = inputType
  input.className = 'ep-input ep-num'
  input.value = value
  input.addEventListener('input', () => {
    if (selectedObject) {
      selectedObject.set(prop, parseFloat(input.value))
      fabricCanvas.renderAll()
    }
  })
  input.addEventListener('change', () => { saveHistory(); persistState() })
  row.appendChild(input)
  return row
}

function buildSliderRow(label, prop, min, max, step, value, formatFn) {
  const row = document.createElement('div')
  row.className = 'ep-row'
  const lbl = document.createElement('label')
  lbl.textContent = label
  row.appendChild(lbl)
  const input = document.createElement('input')
  input.type = 'range'
  input.className = 'ep-slider'
  input.min = min
  input.max = max
  input.step = step
  input.value = value
  const valSpan = document.createElement('span')
  valSpan.className = 'ep-val'
  valSpan.textContent = formatFn(value)
  input.addEventListener('input', () => {
    const v = parseFloat(input.value)
    if (selectedObject) {
      selectedObject.set(prop, v)
      fabricCanvas.renderAll()
    }
    valSpan.textContent = formatFn(v)
  })
  input.addEventListener('change', () => { saveHistory(); persistState() })
  row.appendChild(input)
  row.appendChild(valSpan)
  return row
}

function buildColorRow(label, prop, value) {
  const row = document.createElement('div')
  row.className = 'ep-row'
  const lbl = document.createElement('label')
  lbl.textContent = label
  row.appendChild(lbl)
  const input = document.createElement('input')
  input.type = 'color'
  input.className = 'ep-color'
  input.value = toHex(value)
  input.addEventListener('input', () => {
    if (selectedObject) {
      selectedObject.set(prop, input.value)
      fabricCanvas.renderAll()
    }
  })
  input.addEventListener('change', () => { saveHistory(); persistState() })
  row.appendChild(input)
  return row
}

function appendTextProperties(content, obj) {
  const fonts = [
    { label: 'Cormorant Garamond', value: "'Cormorant Garamond', Georgia, serif" },
    { label: 'Playfair Display', value: "'Playfair Display', Georgia, serif" },
    { label: 'Yeseva One', value: "'Yeseva One', Georgia, serif" },
    { label: 'Crimson Text', value: "'Crimson Text', Georgia, serif" },
    { label: 'Yesteryear', value: "'Yesteryear', cursive" },
    { label: 'Oranienbaum', value: "'Oranienbaum', Georgia, serif" },
    { label: 'Outfit', value: "'Outfit', system-ui, sans-serif" },
    { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Impact', value: 'Impact, sans-serif' },
    { label: 'Courier New', value: "'Courier New', monospace" },
    { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  ]

  // Font family
  const fontRow = document.createElement('div')
  fontRow.className = 'ep-row'
  const fontLbl = document.createElement('label')
  fontLbl.textContent = 'Font'
  fontRow.appendChild(fontLbl)
  const fontSelect = document.createElement('select')
  fontSelect.className = 'ep-input'
  fontSelect.style.fontSize = '11px'
  fonts.forEach(f => {
    const opt = document.createElement('option')
    opt.value = f.value
    opt.textContent = f.label
    if ((obj.fontFamily || '').includes(f.label)) opt.selected = true
    fontSelect.appendChild(opt)
  })
  fontSelect.addEventListener('change', () => {
    obj.set('fontFamily', fontSelect.value)
    fabricCanvas.renderAll()
    saveHistory(); persistState()
  })
  fontRow.appendChild(fontSelect)
  content.appendChild(fontRow)

  // Font size
  content.appendChild(buildRow('Size', 'number', 'fontSize', obj.fontSize || 36))

  // Color
  content.appendChild(buildColorRow('Color', 'fill', obj.fill))

  // Letter spacing
  content.appendChild(buildSliderRow('Spacing', 'charSpacing', -200, 800, 10, obj.charSpacing || 0, v => String(v)))

  // Bold / Italic / Align
  const styleRow = document.createElement('div')
  styleRow.className = 'ep-row ep-actions'
  const boldBtn = document.createElement('button')
  boldBtn.className = 'ep-btn' + (obj.fontWeight === 'bold' ? ' active' : '')
  boldBtn.innerHTML = '<b>B</b>'
  boldBtn.addEventListener('click', () => {
    obj.set('fontWeight', obj.fontWeight === 'bold' ? 'normal' : 'bold')
    fabricCanvas.renderAll()
    saveHistory(); persistState()
  })
  styleRow.appendChild(boldBtn)

  const italicBtn = document.createElement('button')
  italicBtn.className = 'ep-btn' + (obj.fontStyle === 'italic' ? ' active' : '')
  italicBtn.innerHTML = '<i>I</i>'
  italicBtn.addEventListener('click', () => {
    obj.set('fontStyle', obj.fontStyle === 'italic' ? 'normal' : 'italic')
    fabricCanvas.renderAll()
    saveHistory(); persistState()
  })
  styleRow.appendChild(italicBtn)

  ;['left', 'center', 'right'].forEach(align => {
    const btn = document.createElement('button')
    btn.className = 'ep-btn' + (obj.textAlign === align ? ' active' : '')
    btn.textContent = align === 'left' ? '\u2261' : align === 'center' ? '\u2630' : '\u2261'
    btn.title = align
    btn.addEventListener('click', () => {
      obj.set('textAlign', align)
      fabricCanvas.renderAll()
      saveHistory(); persistState()
    })
    styleRow.appendChild(btn)
  })
  content.appendChild(styleRow)
}

function appendShapeProperties(content, obj) {
  content.appendChild(buildColorRow('Fill', 'fill', obj.fill))
  content.appendChild(buildColorRow('Stroke', 'stroke', obj.stroke))
  content.appendChild(buildRow('Stroke W', 'number', 'strokeWidth', obj.strokeWidth || 2))
  if (obj.type === 'rect') {
    content.appendChild(buildRow('Radius', 'number', 'rx', obj.rx || 0))
  }
}

function toHex(color) {
  if (!color || color === 'transparent') return '#000000'
  if (typeof color === 'string' && color.startsWith('#')) return color.substring(0, 7)
  const m = typeof color === 'string' && color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (m) return '#' + [m[1], m[2], m[3]].map(x => parseInt(x).toString(16).padStart(2, '0')).join('')
  return '#000000'
}

function wirePropertiesPanel() {
  document.getElementById('ep-close')?.addEventListener('click', () => {
    document.getElementById('editor-props')?.classList.remove('open')
    fabricCanvas.discardActiveObject()
    fabricCanvas.renderAll()
  })
}

// ─── Templates ──────────────────────────────────────────────
const BUILT_IN_TEMPLATES = [
  {
    name: 'City Name Poster',
    description: 'Big city name, coordinates, frame border',
    create: (cw, ch) => {
      addFrame('simple')
      addText('NEW YORK', { left: cw / 2 - 140, top: 30, fontSize: 52, fontFamily: "'Cormorant Garamond', Georgia, serif", charSpacing: 400, fill: '#e8e4dc', textAlign: 'center', width: 280 })
      addText('40.7128\u00b0 N, 74.0060\u00b0 W', { left: cw / 2 - 100, top: ch - 60, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fill: '#908c84', textAlign: 'center', width: 200, charSpacing: 100 })
    }
  },
  {
    name: 'Minimal',
    description: 'Just the map, small location text bottom-right',
    create: (cw, ch) => {
      addText('Location', { left: cw - 120, top: ch - 40, fontSize: 14, fontFamily: "'Outfit', system-ui, sans-serif", fill: '#908c84', textAlign: 'right', width: 100 })
    }
  },
  {
    name: 'Vintage Postcard',
    description: 'Decorative border, retro greeting text',
    create: (cw, ch) => {
      addFrame('ornate')
      addText('Greetings from', { left: cw / 2 - 110, top: 40, fontSize: 22, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: 'italic', fill: '#e8e4dc', textAlign: 'center', width: 220 })
      addText('THE CITY', { left: cw / 2 - 130, top: 70, fontSize: 48, fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 'bold', fill: '#c4956a', textAlign: 'center', width: 260, charSpacing: 300 })
      addText('EST. 2024', { left: cw / 2 - 60, top: ch - 50, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fill: '#5a5750', textAlign: 'center', width: 120, charSpacing: 200 })
    }
  },
  {
    name: 'Travel Journal',
    description: 'Date, location, body text area',
    create: (cw, ch) => {
      addText('April 2024', { left: 30, top: 20, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fill: '#908c84', textAlign: 'left', width: 120, charSpacing: 100 })
      addText('City Name', { left: 30, top: 40, fontSize: 36, fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 'bold', fill: '#e8e4dc', textAlign: 'left', width: 260 })
      addShape('line', { left: 30, top: ch - 80, stroke: '#c4956a', strokeWidth: 1 })
      addText('Write your memories here...', { left: 30, top: ch - 70, fontSize: 13, fontFamily: "'Outfit', system-ui, sans-serif", fill: '#908c84', textAlign: 'left', width: cw - 60 })
    }
  },
  {
    name: 'Modern Poster',
    description: 'Large bold text, geometric accent shapes',
    create: (cw, ch) => {
      addText('EXPLORE', { left: cw / 2 - 150, top: 20, fontSize: 64, fontFamily: "'Outfit', system-ui, sans-serif", fontWeight: 'bold', fill: '#e8e4dc', textAlign: 'center', width: 300, charSpacing: 200 })
      addShape('circle', { left: cw - 70, top: 20, radius: 20, fill: 'rgba(196,149,106,0.5)', stroke: 'transparent', strokeWidth: 0 })
      addShape('rect', { left: 20, top: ch - 60, width: 40, height: 4, fill: '#c4956a', stroke: 'transparent', strokeWidth: 0 })
      addText('DISCOVER YOUR WORLD', { left: 20, top: ch - 48, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#5a5750', textAlign: 'left', width: 200, charSpacing: 200 })
    }
  },
]

function applyTemplate(template) {
  fabricCanvas.clear()
  fabricCanvas.backgroundColor = null
  const cw = fabricCanvas.width, ch = fabricCanvas.height
  template.create(cw, ch)
  fabricCanvas.renderAll()
  saveHistory()
  persistState()
}

function wireTemplateUI() {
  // Built-in templates
  document.querySelectorAll('[data-template]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.template)
      if (BUILT_IN_TEMPLATES[idx]) {
        if (!editorActive) setEditorActive(true)
        applyTemplate(BUILT_IN_TEMPLATES[idx])
      }
    })
  })

  // Save current as template
  document.getElementById('ed-save-template')?.addEventListener('click', () => {
    const name = prompt('Template name:')
    if (!name) return
    saveCustomTemplate(name)
  })

  // Load saved templates list
  renderCustomTemplates()

  // Clear canvas
  document.getElementById('ed-clear-canvas')?.addEventListener('click', () => {
    fabricCanvas.clear()
    fabricCanvas.backgroundColor = null
    fabricCanvas.renderAll()
    saveHistory()
    persistState()
  })
}

function saveCustomTemplate(name) {
  const json = fabricCanvas.toJSON(['name', 'editorType'])
  json.objects = json.objects.filter(o => !o.excludeFromExport)
  const templates = loadCustomTemplates()
  templates.push({ name, data: JSON.stringify(json), created: Date.now() })
  localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates))
  renderCustomTemplates()
}

function loadCustomTemplates() {
  try {
    return JSON.parse(localStorage.getItem(TEMPLATES_STORAGE_KEY) || '[]')
  } catch { return [] }
}

function renderCustomTemplates() {
  const list = document.getElementById('ed-custom-templates')
  if (!list) return
  const templates = loadCustomTemplates()
  while (list.firstChild) list.removeChild(list.firstChild)
  templates.forEach((t, idx) => {
    const el = document.createElement('div')
    el.className = 'ed-template-item'
    const nameSpan = document.createElement('span')
    nameSpan.className = 'ed-template-name'
    nameSpan.textContent = t.name
    el.appendChild(nameSpan)
    const delSpan = document.createElement('span')
    delSpan.className = 'ed-template-del'
    delSpan.textContent = '\u00d7'
    delSpan.addEventListener('click', (e) => {
      e.stopPropagation()
      templates.splice(idx, 1)
      localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates))
      renderCustomTemplates()
    })
    el.appendChild(delSpan)
    el.addEventListener('click', () => {
      if (!editorActive) setEditorActive(true)
      _skipHistory = true
      fabricCanvas.loadFromJSON(JSON.parse(t.data)).then(() => {
        fabricCanvas.renderAll()
        _skipHistory = false
        saveHistory()
        persistState()
      })
    })
    list.appendChild(el)
  })
}

// ─── Persistence ────────────────────────────────────────────
function persistState() {
  try {
    const json = fabricCanvas.toJSON(['name', 'editorType'])
    json.objects = json.objects.filter(o => !o.excludeFromExport)
    localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(json))
  } catch {}
}

function restoreState() {
  try {
    const raw = localStorage.getItem(EDITOR_STORAGE_KEY)
    if (!raw) return
    const json = JSON.parse(raw)
    if (!json.objects?.length) return
    _skipHistory = true
    fabricCanvas.loadFromJSON(json).then(() => {
      fabricCanvas.renderAll()
      _skipHistory = false
    })
  } catch {}
}

// ─── Export compositing ─────────────────────────────────────
export function compositeExport() {
  return new Promise((resolve) => {
    const r3fCanvas = document.querySelector('#r3f-root canvas')
    if (!r3fCanvas) { resolve(null); return }

    const bgUrl = r3fCanvas.toDataURL('image/png')
    const bgImg = new Image()
    bgImg.onload = () => {
      const w = r3fCanvas.width
      const h = r3fCanvas.height
      const comp = document.createElement('canvas')
      comp.width = w
      comp.height = h
      const ctx = comp.getContext('2d')

      // Draw 3D render
      ctx.drawImage(bgImg, 0, 0, w, h)

      // Draw editor overlay at same resolution
      if (fabricCanvas && fabricCanvas.getObjects().filter(o => !o.excludeFromExport).length > 0) {
        const origW = fabricCanvas.width
        const scaleX = w / origW

        const overlayUrl = fabricCanvas.toDataURL({
          format: 'png',
          multiplier: scaleX,
        })
        const overlayImg = new Image()
        overlayImg.onload = () => {
          ctx.drawImage(overlayImg, 0, 0, w, h)
          resolve(comp.toDataURL('image/png'))
        }
        overlayImg.onerror = () => resolve(bgUrl)
        overlayImg.src = overlayUrl
      } else {
        resolve(bgUrl)
      }
    }
    bgImg.onerror = () => resolve(null)
    bgImg.src = bgUrl
  })
}

// ─── Expose for external use ────────────────────────────────
export { fabricCanvas, addText, addShape, addImage, addFrame, addSticker, deleteSelected, undo, redo }
