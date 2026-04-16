// ─── Pricing / Tier Logic ───────────────────────────────────
// Free vs Pro tier definitions and gating
// Note: All DOM construction uses safe methods (textContent, createElement).

// Kill switch — flip to `true` to re-enable tier gating (watermark,
// saved-view limit, high-res exports). While disabled every check behaves
// as if the user is on Pro, so no call site needs to change.
const PAYWALL_ENABLED = false

const STORAGE_KEY = 'mapposter_tier'
const WAITLIST_KEY = 'mapposter_waitlist_email'

export const TIERS = {
  free: {
    name: 'Free',
    maxSavedViews: 5,
    maxExportScale: 1,
    watermark: true,
    priorityRender: false,
    exclusivePresets: false,
  },
  pro: {
    name: 'Pro',
    price: '$9.99/month',
    yearlyPrice: '$79/year',
    maxSavedViews: Infinity,
    maxExportScale: 4,
    watermark: false,
    priorityRender: true,
    exclusivePresets: true,
  }
}

export function getCurrentTier() {
  if (!PAYWALL_ENABLED) return 'pro'
  return localStorage.getItem(STORAGE_KEY) || 'free'
}

export function getTierConfig() {
  return TIERS[getCurrentTier()] || TIERS.free
}

export function isProUser() {
  return getCurrentTier() === 'pro'
}

export function canSaveView(currentCount) {
  const tier = getTierConfig()
  return currentCount < tier.maxSavedViews
}

export function canExportScale(scale) {
  const tier = getTierConfig()
  return scale <= tier.maxExportScale
}

export function shouldWatermark() {
  return getTierConfig().watermark
}

// Watermark: draws "Made with MapPoster" on a canvas
export function applyWatermark(canvas) {
  if (!shouldWatermark()) return canvas

  const ctx = canvas.getContext('2d')
  const text = 'Made with MapPoster'
  const fontSize = Math.max(12, Math.round(canvas.width * 0.012))

  ctx.save()
  ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'

  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetX = 1
  ctx.shadowOffsetY = 1

  ctx.fillText(text, canvas.width - fontSize, canvas.height - fontSize * 0.8)
  ctx.restore()

  return canvas
}

// Upgrade prompt modal
let upgradeModal = null

export function showUpgradePrompt(reason = '') {
  if (upgradeModal) {
    upgradeModal.classList.add('up-open')
    return
  }

  upgradeModal = document.createElement('div')
  upgradeModal.id = 'upgrade-modal'

  const backdrop = document.createElement('div')
  backdrop.className = 'up-backdrop'
  backdrop.addEventListener('click', hideUpgrade)

  const panel = document.createElement('div')
  panel.className = 'up-panel'

  const closeBtn = document.createElement('button')
  closeBtn.className = 'up-close'
  closeBtn.type = 'button'
  closeBtn.textContent = '\u00d7'
  closeBtn.addEventListener('click', hideUpgrade)

  const icon = document.createElement('div')
  icon.className = 'up-icon'
  icon.textContent = '\u2726'

  const title = document.createElement('div')
  title.className = 'up-title'
  title.textContent = 'Upgrade to Pro'

  panel.appendChild(closeBtn)
  panel.appendChild(icon)
  panel.appendChild(title)

  if (reason) {
    const reasonEl = document.createElement('div')
    reasonEl.className = 'up-reason'
    reasonEl.textContent = reason
    panel.appendChild(reasonEl)
  }

  const features = document.createElement('div')
  features.className = 'up-features'
  const featureList = [
    'High-res exports (up to 4x)',
    'No watermark',
    'Unlimited saved views',
    'Priority rendering',
    'Exclusive style presets',
  ]
  featureList.forEach(text => {
    const feat = document.createElement('div')
    feat.className = 'up-feat'
    feat.textContent = text
    features.appendChild(feat)
  })
  panel.appendChild(features)

  const price = document.createElement('div')
  price.className = 'up-price'
  price.textContent = '$9.99'
  const priceSuffix1 = document.createElement('span')
  priceSuffix1.textContent = '/month or $79'
  const priceSuffix2 = document.createElement('span')
  priceSuffix2.textContent = '/year'
  price.appendChild(priceSuffix1)
  price.appendChild(priceSuffix2)
  panel.appendChild(price)

  const waitlistSection = document.createElement('div')
  waitlistSection.className = 'up-waitlist-section'

  const soon = document.createElement('div')
  soon.className = 'up-soon'
  soon.textContent = 'Coming soon \u2014 join the waitlist'

  const form = document.createElement('div')
  form.className = 'up-waitlist-form'

  const emailInput = document.createElement('input')
  emailInput.className = 'up-email'
  emailInput.type = 'email'
  emailInput.placeholder = 'your@email.com'
  emailInput.autocomplete = 'email'

  const submitBtn = document.createElement('button')
  submitBtn.className = 'up-submit'
  submitBtn.type = 'button'
  submitBtn.textContent = 'Join'

  const done = document.createElement('div')
  done.className = 'up-waitlist-done'
  done.style.display = 'none'
  done.textContent = "You're on the list! We'll notify you at launch."

  submitBtn.addEventListener('click', () => {
    const email = emailInput.value.trim()
    if (!email || !email.includes('@')) return

    const existing = JSON.parse(localStorage.getItem(WAITLIST_KEY) || '[]')
    if (!existing.includes(email)) {
      existing.push(email)
      localStorage.setItem(WAITLIST_KEY, JSON.stringify(existing))
    }

    form.style.display = 'none'
    done.style.display = 'block'
  })

  form.appendChild(emailInput)
  form.appendChild(submitBtn)
  waitlistSection.appendChild(soon)
  waitlistSection.appendChild(form)
  waitlistSection.appendChild(done)
  panel.appendChild(waitlistSection)

  upgradeModal.appendChild(backdrop)
  upgradeModal.appendChild(panel)

  document.body.appendChild(upgradeModal)
  requestAnimationFrame(() => upgradeModal.classList.add('up-open'))
}

function hideUpgrade() {
  if (upgradeModal) upgradeModal.classList.remove('up-open')
}

// CSS
const style = document.createElement('style')
style.textContent = `
  #upgrade-modal {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 10002;
    align-items: center;
    justify-content: center;
  }
  #upgrade-modal.up-open { display: flex; }
  .up-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(6, 5, 8, 0.7);
    backdrop-filter: blur(8px);
  }
  .up-panel {
    position: relative;
    width: 380px;
    max-width: 90vw;
    background: rgba(28, 27, 31, 0.96);
    backdrop-filter: blur(40px);
    border: 0.5px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 32px;
    box-shadow: 0 40px 80px rgba(0,0,0,0.5), inset 0 0.5px 0 rgba(255,255,255,0.08);
    text-align: center;
    color: #eceae3;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
  }
  .up-close {
    position: absolute;
    top: 14px;
    right: 16px;
    background: none;
    border: none;
    color: rgba(236,234,227,0.4);
    font-size: 20px;
    cursor: pointer;
  }
  .up-close:hover { color: rgba(236,234,227,0.8); }
  .up-icon {
    font-size: 32px;
    color: #c8b897;
    margin-bottom: 12px;
  }
  .up-title {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 22px;
    font-weight: 300;
    margin-bottom: 8px;
  }
  .up-reason {
    font-size: 12px;
    color: rgba(236,234,227,0.5);
    margin-bottom: 16px;
  }
  .up-features {
    text-align: left;
    margin: 16px 0;
    padding: 16px 20px;
    background: rgba(255,255,255,0.03);
    border-radius: 10px;
    border: 0.5px solid rgba(255,255,255,0.05);
  }
  .up-feat {
    font-size: 13px;
    color: rgba(236,234,227,0.7);
    padding: 5px 0;
    padding-left: 20px;
    position: relative;
  }
  .up-feat::before {
    content: '\\2713';
    position: absolute;
    left: 0;
    color: #6b9b6e;
    font-size: 12px;
  }
  .up-price {
    font-size: 20px;
    font-weight: 500;
    margin: 16px 0 8px;
    color: #c8b897;
  }
  .up-price span {
    font-size: 13px;
    font-weight: 300;
    color: rgba(236,234,227,0.5);
  }
  .up-soon {
    font-size: 11px;
    color: rgba(236,234,227,0.4);
    letter-spacing: 0.06em;
    margin-bottom: 12px;
  }
  .up-waitlist-form {
    display: flex;
    gap: 8px;
  }
  .up-email {
    flex: 1;
    background: rgba(255,255,255,0.04);
    border: 0.5px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    padding: 10px 14px;
    color: #eceae3;
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }
  .up-email:focus { border-color: rgba(200,184,151,0.4); }
  .up-email::placeholder { color: rgba(236,234,227,0.3); }
  .up-submit {
    background: rgba(200, 184, 151, 0.2);
    border: 0.5px solid rgba(200, 184, 151, 0.4);
    color: #c8b897;
    font-size: 13px;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .up-submit:hover {
    background: rgba(200, 184, 151, 0.3);
  }
  .up-waitlist-done {
    font-size: 13px;
    color: #6b9b6e;
    padding: 10px 0;
  }
`
document.head.appendChild(style)
