// ─── Onboarding Tour ────────────────────────────────────────
// First-time user walkthrough with spotlight + tooltip steps
// Note: All DOM construction uses safe methods (textContent, createElement).

const STORAGE_KEY = 'mapposter_onboarding_done'

const STEPS = [
  {
    title: 'Welcome to MapPoster',
    body: 'Create stunning 3D map posters of any place in the world. Fly around the globe, add artistic styles, and export print-ready artwork.',
    target: null,
    icon: '\u{1F5FA}\u{FE0F}',
  },
  {
    title: 'Search any place',
    body: 'Type any location and press Enter to fly there instantly. Try "Golden Gate Bridge" or "Tokyo Tower".',
    target: '#location-search',
    icon: '\u{1F50D}',
  },
  {
    title: 'Customize your view',
    body: 'Adjust time of day, camera angle, depth of field, and atmospheric effects. Drag the globe to orbit, scroll to zoom.',
    target: '[data-sec="camera"] .section-head',
    icon: '\u{1F3A8}',
  },
  {
    title: 'Export & share',
    body: 'Download your poster or apply AI art styles. Use Quick Download for instant results, or explore the Render Styles panel for creative transformations.',
    target: '#quick-download-btn',
    icon: '\u2728',
  },
]

let currentStep = 0
let overlay = null

function hasCompleted() {
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

function markComplete() {
  localStorage.setItem(STORAGE_KEY, 'true')
}

function buildOverlay() {
  if (overlay) return overlay

  overlay = document.createElement('div')
  overlay.id = 'onboarding-overlay'

  const backdrop = document.createElement('div')
  backdrop.className = 'ob-backdrop'
  backdrop.addEventListener('click', finish)

  const spotlight = document.createElement('div')
  spotlight.className = 'ob-spotlight'

  const tooltip = document.createElement('div')
  tooltip.className = 'ob-tooltip'

  const iconEl = document.createElement('div')
  iconEl.className = 'ob-step-icon'
  const titleEl = document.createElement('div')
  titleEl.className = 'ob-step-title'
  const bodyEl = document.createElement('div')
  bodyEl.className = 'ob-step-body'

  const footer = document.createElement('div')
  footer.className = 'ob-footer'

  const dots = document.createElement('div')
  dots.className = 'ob-dots'

  const actions = document.createElement('div')
  actions.className = 'ob-actions'

  const skipBtn = document.createElement('button')
  skipBtn.className = 'ob-skip'
  skipBtn.type = 'button'
  skipBtn.textContent = 'Skip'
  skipBtn.addEventListener('click', finish)

  const nextBtn = document.createElement('button')
  nextBtn.className = 'ob-next'
  nextBtn.type = 'button'
  nextBtn.textContent = 'Next'
  nextBtn.addEventListener('click', nextStep)

  actions.appendChild(skipBtn)
  actions.appendChild(nextBtn)
  footer.appendChild(dots)
  footer.appendChild(actions)

  tooltip.appendChild(iconEl)
  tooltip.appendChild(titleEl)
  tooltip.appendChild(bodyEl)
  tooltip.appendChild(footer)

  overlay.appendChild(backdrop)
  overlay.appendChild(spotlight)
  overlay.appendChild(tooltip)

  document.body.appendChild(overlay)
  return overlay
}

function positionTooltip(step) {
  const tooltip = overlay.querySelector('.ob-tooltip')
  const spotlight = overlay.querySelector('.ob-spotlight')

  if (!step.target) {
    tooltip.style.cssText = 'left:50%;top:50%;transform:translate(-50%,-50%);'
    spotlight.style.display = 'none'
    return
  }

  const el = document.querySelector(step.target)
  if (!el) {
    tooltip.style.cssText = 'left:50%;top:50%;transform:translate(-50%,-50%);'
    spotlight.style.display = 'none'
    return
  }

  const rect = el.getBoundingClientRect()
  const pad = 8

  spotlight.style.display = 'block'
  spotlight.style.left = (rect.left - pad) + 'px'
  spotlight.style.top = (rect.top - pad) + 'px'
  spotlight.style.width = (rect.width + pad * 2) + 'px'
  spotlight.style.height = (rect.height + pad * 2) + 'px'

  const tooltipW = 320
  let left = rect.left
  let top = rect.bottom + 16

  if (left + tooltipW > window.innerWidth - 20) left = window.innerWidth - tooltipW - 20
  if (left < 20) left = 20
  if (top + 200 > window.innerHeight) top = rect.top - 200

  tooltip.style.cssText = `left:${left}px;top:${top}px;transform:none;`
}

function renderStep(idx) {
  const step = STEPS[idx]

  overlay.querySelector('.ob-step-icon').textContent = step.icon
  overlay.querySelector('.ob-step-title').textContent = step.title
  overlay.querySelector('.ob-step-body').textContent = step.body

  // Rebuild dots
  const dotsContainer = overlay.querySelector('.ob-dots')
  while (dotsContainer.firstChild) dotsContainer.removeChild(dotsContainer.firstChild)
  STEPS.forEach((_, i) => {
    const dot = document.createElement('span')
    dot.className = 'ob-dot' + (i === idx ? ' active' : '')
    dotsContainer.appendChild(dot)
  })

  const nextBtn = overlay.querySelector('.ob-next')
  nextBtn.textContent = idx === STEPS.length - 1 ? 'Get started' : 'Next'

  positionTooltip(step)
}

function nextStep() {
  currentStep++
  if (currentStep >= STEPS.length) {
    finish()
    return
  }
  renderStep(currentStep)
}

function finish() {
  markComplete()
  if (overlay) {
    overlay.classList.remove('ob-active')
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true })
    setTimeout(() => { if (overlay?.parentNode) overlay.remove() }, 400)
    overlay = null
  }
}

export function startOnboarding(force = false) {
  if (!force && hasCompleted()) return
  currentStep = 0
  buildOverlay()
  renderStep(0)
  requestAnimationFrame(() => overlay.classList.add('ob-active'))
}

export function resetOnboarding() {
  localStorage.removeItem(STORAGE_KEY)
}

// CSS
const style = document.createElement('style')
style.textContent = `
  #onboarding-overlay {
    position: fixed;
    inset: 0;
    z-index: 10001;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
  }
  #onboarding-overlay.ob-active {
    opacity: 1;
    pointer-events: auto;
  }
  .ob-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(6, 5, 8, 0.75);
  }
  .ob-spotlight {
    position: absolute;
    border-radius: 10px;
    box-shadow: 0 0 0 9999px rgba(6, 5, 8, 0.75);
    z-index: 1;
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    display: none;
  }
  .ob-tooltip {
    position: absolute;
    z-index: 2;
    width: 320px;
    max-width: calc(100vw - 40px);
    background: rgba(28, 27, 31, 0.96);
    backdrop-filter: blur(40px) saturate(150%);
    border: 0.5px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    padding: 24px;
    box-shadow:
      0 24px 48px rgba(0, 0, 0, 0.4),
      inset 0 0.5px 0 rgba(255, 255, 255, 0.1);
    color: #eceae3;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
  }
  .ob-step-icon {
    font-size: 28px;
    margin-bottom: 12px;
  }
  .ob-step-title {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 18px;
    font-weight: 300;
    margin-bottom: 8px;
    line-height: 1.3;
  }
  .ob-step-body {
    font-size: 13px;
    line-height: 1.6;
    color: rgba(236, 234, 227, 0.65);
    margin-bottom: 20px;
  }
  .ob-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .ob-dots {
    display: flex;
    gap: 6px;
  }
  .ob-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    transition: background 0.2s;
  }
  .ob-dot.active {
    background: #c8b897;
  }
  .ob-actions {
    display: flex;
    gap: 10px;
  }
  .ob-skip {
    background: none;
    border: none;
    color: rgba(236, 234, 227, 0.4);
    font-size: 12px;
    cursor: pointer;
    padding: 6px 12px;
    font-family: inherit;
    transition: color 0.15s;
  }
  .ob-skip:hover { color: rgba(236, 234, 227, 0.7); }
  .ob-next {
    background: rgba(200, 184, 151, 0.2);
    border: 0.5px solid rgba(200, 184, 151, 0.4);
    color: #c8b897;
    font-size: 12px;
    padding: 7px 18px;
    border-radius: 8px;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }
  .ob-next:hover {
    background: rgba(200, 184, 151, 0.3);
    color: #e0d4b8;
  }
`
document.head.appendChild(style)
