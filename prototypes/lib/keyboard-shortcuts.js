// ─── Keyboard Shortcuts ─────────────────────────────────────
// Global shortcuts with a help modal on '?'
// Note: All DOM construction uses safe methods (textContent, createElement).

const SHORTCUTS = [
  { key: 's', label: 'Save current view', action: 'save-view' },
  { key: 'e', label: 'Quick export', action: 'quick-export' },
  { key: 'r', label: 'Reset to default view', action: 'reset-view' },
  { key: 't', label: 'Toggle render styles', action: 'toggle-styles' },
  { key: 'g', label: 'Open gallery', action: 'open-gallery' },
  { key: 'Escape', display: 'Esc', label: 'Close modal / panel', action: 'close-modal' },
  { key: '?', label: 'Show keyboard shortcuts', action: 'show-help' },
]

let helpModal = null
let helpVisible = false

function buildHelpModal() {
  if (helpModal) return helpModal

  helpModal = document.createElement('div')
  helpModal.id = 'shortcuts-modal'

  const backdrop = document.createElement('div')
  backdrop.className = 'sc-backdrop'
  backdrop.addEventListener('click', hideHelp)

  const panel = document.createElement('div')
  panel.className = 'sc-panel'

  const header = document.createElement('div')
  header.className = 'sc-header'

  const title = document.createElement('span')
  title.className = 'sc-title'
  title.textContent = 'Keyboard Shortcuts'

  const closeBtn = document.createElement('button')
  closeBtn.className = 'sc-close'
  closeBtn.type = 'button'
  closeBtn.textContent = '\u00d7'
  closeBtn.addEventListener('click', hideHelp)

  header.appendChild(title)
  header.appendChild(closeBtn)

  const body = document.createElement('div')
  body.className = 'sc-body'

  SHORTCUTS.forEach(s => {
    const row = document.createElement('div')
    row.className = 'sc-row'

    const kbd = document.createElement('kbd')
    kbd.className = 'sc-key'
    kbd.textContent = s.display || s.key.toUpperCase()

    const label = document.createElement('span')
    label.className = 'sc-label'
    label.textContent = s.label

    row.appendChild(kbd)
    row.appendChild(label)
    body.appendChild(row)
  })

  panel.appendChild(header)
  panel.appendChild(body)
  helpModal.appendChild(backdrop)
  helpModal.appendChild(panel)

  document.body.appendChild(helpModal)
  return helpModal
}

function showHelp() {
  buildHelpModal()
  helpModal.classList.add('sc-open')
  helpVisible = true
}

function hideHelp() {
  if (helpModal) helpModal.classList.remove('sc-open')
  helpVisible = false
}

function isInputFocused() {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' && isInputFocused()) return
    if (e.key !== 'Escape' && (e.ctrlKey || e.metaKey || e.altKey)) return

    switch (e.key) {
      case '?':
        e.preventDefault()
        if (helpVisible) hideHelp()
        else showHelp()
        break

      case 's':
        e.preventDefault()
        document.getElementById('save-view-btn')?.click()
        break

      case 'e':
        e.preventDefault()
        document.getElementById('quick-download-btn')?.click()
        break

      case 'r':
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('camera-set', {
          detail: { lat: 40.748440, lng: -73.985664, altitude: 700, tilt: 51, heading: 67 }
        }))
        break

      case 't':
        e.preventDefault()
        document.getElementById('open-render-styles-btn')?.click()
        break

      case 'g':
        e.preventDefault()
        document.getElementById('open-gallery-btn')?.click()
        break

      case 'Escape':
        if (helpVisible) { hideHelp(); e.preventDefault(); return }
        const closables = [
          'gallery-overlay', 'tm-overlay', 'lightbox', 'poster-preview'
        ]
        for (const id of closables) {
          const el = document.getElementById(id)
          if (el?.classList.contains('open')) {
            el.classList.remove('open')
            document.body.classList.remove('preview-open')
            e.preventDefault()
            return
          }
        }
        document.querySelectorAll('.dropdown-panel.open').forEach(p => p.classList.remove('open'))
        break
    }
  })

  // Floating help button
  const helpBtn = document.createElement('button')
  helpBtn.id = 'shortcuts-help-btn'
  helpBtn.type = 'button'
  helpBtn.textContent = '?'
  helpBtn.title = 'Keyboard shortcuts'
  helpBtn.addEventListener('click', () => {
    if (helpVisible) hideHelp()
    else showHelp()
  })
  document.body.appendChild(helpBtn)
}

// CSS
const style = document.createElement('style')
style.textContent = `
  #shortcuts-help-btn {
    position: fixed;
    bottom: 24px;
    left: 24px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(20, 19, 23, 0.72);
    backdrop-filter: blur(20px);
    border: 0.5px solid rgba(255, 255, 255, 0.1);
    color: rgba(236, 234, 227, 0.5);
    font-size: 14px;
    font-family: -apple-system, system-ui, sans-serif;
    cursor: pointer;
    z-index: 90;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }
  #shortcuts-help-btn:hover {
    color: rgba(236, 234, 227, 0.9);
    background: rgba(30, 29, 33, 0.85);
  }

  #shortcuts-modal {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 10000;
    align-items: center;
    justify-content: center;
  }
  #shortcuts-modal.sc-open { display: flex; }
  .sc-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(6, 5, 8, 0.7);
    backdrop-filter: blur(8px);
  }
  .sc-panel {
    position: relative;
    width: 340px;
    max-width: 90vw;
    background: rgba(28, 27, 31, 0.95);
    backdrop-filter: blur(40px);
    border: 0.5px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    box-shadow: 0 40px 80px rgba(0,0,0,0.5), inset 0 0.5px 0 rgba(255,255,255,0.08);
    overflow: hidden;
  }
  .sc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px 14px;
    border-bottom: 0.5px solid rgba(255,255,255,0.05);
  }
  .sc-title {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 15px;
    font-weight: 300;
    color: #eceae3;
  }
  .sc-close {
    background: none;
    border: none;
    color: rgba(236,234,227,0.4);
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .sc-close:hover { color: rgba(236,234,227,0.8); }
  .sc-body { padding: 14px 20px 20px; }
  .sc-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 0;
  }
  .sc-key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 24px;
    padding: 0 8px;
    background: rgba(255,255,255,0.06);
    border: 0.5px solid rgba(255,255,255,0.12);
    border-radius: 5px;
    font-family: 'SF Mono', ui-monospace, monospace;
    font-size: 11px;
    color: #eceae3;
    flex-shrink: 0;
  }
  .sc-label {
    font-size: 12px;
    color: rgba(236,234,227,0.6);
  }
`
document.head.appendChild(style)
