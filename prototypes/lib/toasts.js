// ─── Toast Notification System ──────────────────────────────
// Global toast stack with auto-dismiss, slide-in animation, dark glassmorphism
// Note: All innerHTML usage here is with static strings only — no user input.

const TOAST_DURATION = 4000
const TOAST_MAX = 5
const toasts = []
let toastContainer = null

const ICONS = {
  success: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b9b6e" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`,
  error: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c45a5a" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>`,
  info: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7a9abc" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
}

function ensureContainer() {
  if (toastContainer) return toastContainer
  toastContainer = document.createElement('div')
  toastContainer.id = 'toast-container'
  document.body.appendChild(toastContainer)
  return toastContainer
}

function createToastElement(message, type) {
  const el = document.createElement('div')
  el.className = `toast toast-${type}`

  const icon = document.createElement('span')
  icon.className = 'toast-icon'
  // Static SVG icons — safe to set via innerHTML
  icon.innerHTML = ICONS[type] || ICONS.info // eslint-disable-line

  const msg = document.createElement('span')
  msg.className = 'toast-msg'
  msg.textContent = message

  const close = document.createElement('button')
  close.className = 'toast-close'
  close.type = 'button'
  close.textContent = '\u00d7'

  el.appendChild(icon)
  el.appendChild(msg)
  el.appendChild(close)

  return el
}

export function toast(message, type = 'info') {
  const container = ensureContainer()
  const el = createToastElement(message, type)

  el.querySelector('.toast-close').addEventListener('click', () => dismissToast(el))

  container.appendChild(el)
  requestAnimationFrame(() => el.classList.add('toast-visible'))

  const entry = { el, timer: setTimeout(() => dismissToast(el), TOAST_DURATION) }
  toasts.push(entry)

  while (toasts.length > TOAST_MAX) {
    dismissToast(toasts[0].el)
  }

  return el
}

function dismissToast(el) {
  const idx = toasts.findIndex(t => t.el === el)
  if (idx >= 0) {
    clearTimeout(toasts[idx].timer)
    toasts.splice(idx, 1)
  }
  el.classList.remove('toast-visible')
  el.classList.add('toast-exit')
  el.addEventListener('transitionend', () => el.remove(), { once: true })
  setTimeout(() => { if (el.parentNode) el.remove() }, 400)
}

export function toastSuccess(msg) { return toast(msg, 'success') }
export function toastError(msg) { return toast(msg, 'error') }
export function toastInfo(msg) { return toast(msg, 'info') }

// CSS injected once
const style = document.createElement('style')
style.textContent = `
  #toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    pointer-events: none;
    max-width: 360px;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: rgba(20, 19, 23, 0.88);
    backdrop-filter: blur(24px) saturate(150%);
    -webkit-backdrop-filter: blur(24px) saturate(150%);
    border: 0.5px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    box-shadow:
      0 12px 32px rgba(0, 0, 0, 0.4),
      inset 0 0.5px 0 rgba(255, 255, 255, 0.08);
    color: #eceae3;
    font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
    pointer-events: auto;
    transform: translateX(120%);
    opacity: 0;
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
    will-change: transform, opacity;
  }
  .toast-visible {
    transform: translateX(0);
    opacity: 1;
  }
  .toast-exit {
    transform: translateX(120%);
    opacity: 0;
  }
  .toast-icon { flex-shrink: 0; display: flex; }
  .toast-msg { flex: 1; line-height: 1.4; }
  .toast-close {
    flex-shrink: 0;
    background: none;
    border: none;
    color: rgba(236, 234, 227, 0.4);
    font-size: 16px;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
    transition: color 0.15s;
  }
  .toast-close:hover { color: rgba(236, 234, 227, 0.8); }
  .toast-success { border-left: 2px solid #6b9b6e; }
  .toast-error { border-left: 2px solid #c45a5a; }
  .toast-info { border-left: 2px solid #7a9abc; }
`
document.head.appendChild(style)
