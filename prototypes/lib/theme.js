// ─── Dark / Light Mode Toggle ───────────────────────────────
// Toggles between dark (default) and light themes across the app.
// Stores preference in localStorage. Uses CSS custom properties override.

const STORAGE_KEY = 'mapposter_theme'

const LIGHT_VARS = {
  '--bg-0': '#f0ece4',
  '--bg-1': '#e8e4dc',
  '--bg-2': '#ddd9d1',
  '--bg-deep': '#f5f2eb',
  '--panel': 'rgba(255, 255, 255, 0.72)',
  '--panel-border': 'rgba(0, 0, 0, 0.08)',
  '--panel-border-strong': 'rgba(0, 0, 0, 0.14)',
  '--rule': 'rgba(0, 0, 0, 0.06)',
  '--ink': '#1c1b1f',
  '--ink-soft': 'rgba(28, 27, 31, 0.65)',
  '--ink-dim': 'rgba(28, 27, 31, 0.4)',
  '--ink-ghost': 'rgba(28, 27, 31, 0.2)',
  '--ink-whisper': 'rgba(28, 27, 31, 0.08)',
  '--accent': '#8a7550',
  '--accent-soft': 'rgba(138, 117, 80, 0.15)',
  '--accent-dim': 'rgba(138, 117, 80, 0.4)',
  '--text-1': '#1c1b1f',
  '--text-2': 'rgba(28, 27, 31, 0.65)',
  '--text-3': 'rgba(28, 27, 31, 0.4)',
  '--bg-panel': 'rgba(255, 255, 255, 0.72)',
  '--bg-surface': 'rgba(0, 0, 0, 0.03)',
  '--bg-raised': 'rgba(0, 0, 0, 0.04)',
  '--bg-hover': 'rgba(0, 0, 0, 0.06)',
}

// Store dark defaults so we can restore them
let darkVars = null

function captureDarkVars() {
  if (darkVars) return
  darkVars = {}
  const style = getComputedStyle(document.documentElement)
  for (const key of Object.keys(LIGHT_VARS)) {
    darkVars[key] = style.getPropertyValue(key).trim()
  }
}

function applyTheme(theme) {
  captureDarkVars()
  const vars = theme === 'light' ? LIGHT_VARS : darkVars
  for (const [k, v] of Object.entries(vars)) {
    document.documentElement.style.setProperty(k, v)
  }
  document.body.classList.toggle('theme-light', theme === 'light')
  document.body.classList.toggle('theme-dark', theme === 'dark')
}

export function getTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'dark'
}

export function setTheme(theme) {
  localStorage.setItem(STORAGE_KEY, theme)
  applyTheme(theme)
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

export function initTheme() {
  const saved = getTheme()
  if (saved === 'light') applyTheme('light')

  // Add toggle button to sidebar logo area
  const logo = document.querySelector('.logo')
  if (!logo) return

  const btn = document.createElement('button')
  btn.id = 'theme-toggle'
  btn.type = 'button'
  btn.title = 'Toggle light/dark mode'
  btn.setAttribute('aria-label', 'Toggle theme')
  updateToggleIcon(btn, saved)

  btn.addEventListener('click', () => {
    const next = toggleTheme()
    updateToggleIcon(btn, next)
  })

  // Insert before the version sub text
  const sub = logo.querySelector('.logo-sub')
  if (sub) logo.insertBefore(btn, sub)
  else logo.appendChild(btn)
}

function updateToggleIcon(btn, theme) {
  // Sun for dark mode (click to go light), moon for light mode (click to go dark)
  btn.textContent = theme === 'dark' ? '\u2600' : '\u263D'
}

// CSS
const style = document.createElement('style')
style.textContent = `
  #theme-toggle {
    background: none;
    border: none;
    font-size: 14px;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 6px;
    transition: background 0.15s;
    line-height: 1;
    color: var(--ink-dim);
  }
  #theme-toggle:hover {
    background: var(--bg-hover);
    color: var(--ink);
  }

  /* Light mode overrides for backdrop-filter panels */
  .theme-light #sidebar {
    box-shadow:
      0 20px 60px rgba(0,0,0,0.08),
      0 8px 20px rgba(0,0,0,0.04),
      inset 0 0.5px 0 rgba(255,255,255,0.8);
  }
  .theme-light #main {
    background:
      radial-gradient(ellipse 70% 55% at 68% 22%, rgba(200, 180, 140, 0.08) 0%, transparent 55%),
      radial-gradient(ellipse 90% 80% at 50% 60%, #e8e4dc 0%, #ddd9d1 40%, #d4d0c8 85%, #ccc8c0 100%);
  }
  .theme-light #main::before {
    background-image:
      linear-gradient(rgba(0, 0, 0, 0.04) 0.5px, transparent 0.5px),
      linear-gradient(90deg, rgba(0, 0, 0, 0.04) 0.5px, transparent 0.5px);
  }
  .theme-light #main::after {
    background-image: radial-gradient(circle, rgba(0, 0, 0, 0.06) 0.8px, transparent 1px);
  }
  .theme-light #canvas-container {
    box-shadow:
      0 1px 0 rgba(255,255,255,0.6),
      0 40px 60px rgba(0,0,0,0.1),
      0 15px 30px rgba(0,0,0,0.06),
      0 2px 8px rgba(0,0,0,0.04);
  }
  .theme-light .toggle.on {
    background: rgba(138, 117, 80, 0.45);
  }
  .theme-light .toggle.on::after {
    background: #fff;
  }
  .theme-light input[type="range"]::-webkit-slider-thumb {
    background: #1c1b1f;
    border-color: rgba(0,0,0,0.15);
  }
  .theme-light input[type="range"]::-webkit-slider-runnable-track {
    background: rgba(0,0,0,0.08);
  }
  .theme-light input[type="range"] {
    background: rgba(0,0,0,0.08);
  }
  .theme-light .text-input {
    background: rgba(0, 0, 0, 0.03);
    border-color: rgba(0, 0, 0, 0.1);
  }
  .theme-light .primary-action {
    background: rgba(0, 0, 0, 0.03);
    border-color: rgba(0, 0, 0, 0.1);
  }
  .theme-light .primary-action:hover {
    background: rgba(0, 0, 0, 0.05);
  }
`
document.head.appendChild(style)
