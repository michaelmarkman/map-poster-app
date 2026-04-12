// ─── AI Scene Suggestions ───────────────────────────────────
// "Try this angle" button — uses Gemini to suggest interesting camera positions
// based on the current location.

import { toastInfo, toastError, toastSuccess } from './toasts.js'

let suggestBtn = null
let suggestPanel = null
let suggesting = false

export function initSceneSuggestions() {
  // Add button to the Camera section
  const cameraMore = document.getElementById('camera-more')
  if (!cameraMore) return

  suggestBtn = document.createElement('button')
  suggestBtn.className = 'suggest-btn'
  suggestBtn.type = 'button'
  suggestBtn.textContent = 'Try this angle'
  suggestBtn.title = 'AI suggests interesting camera angles for this location'

  const icon = document.createElement('span')
  icon.className = 'suggest-icon'
  icon.textContent = '\u2728'
  suggestBtn.insertBefore(icon, suggestBtn.firstChild)

  suggestBtn.addEventListener('click', requestSuggestions)
  cameraMore.appendChild(suggestBtn)

  // Create suggestions panel
  suggestPanel = document.createElement('div')
  suggestPanel.className = 'suggest-panel'
  suggestPanel.id = 'suggest-panel'
  cameraMore.appendChild(suggestPanel)
}

async function requestSuggestions() {
  if (suggesting) return
  suggesting = true
  suggestBtn.disabled = true
  suggestBtn.textContent = 'Thinking...'

  const location = document.getElementById('location-search')?.value || 'this location'

  try {
    // Capture current canvas for context
    const canvas = document.querySelector('#r3f-root canvas')
    const screenshot = canvas ? canvas.toDataURL('image/jpeg', 0.5) : null
    const base64 = screenshot ? screenshot.split(',')[1] : null

    const prompt = `You are a camera angle advisor for a 3D map poster app showing real-world locations from Google Earth-style 3D tiles.

The user is viewing: "${location}"

Suggest 3 dramatically different and visually interesting camera angles for this location. For each suggestion, provide:
1. A short name (3-5 words)
2. Why it looks good (1 sentence)
3. Camera parameters: tilt (0=straight down, 90=horizon), heading (0=north, 90=east, -90=west, 180=south), altitude in meters (100-5000)

Respond ONLY with valid JSON, no markdown:
[
  {"name": "...", "why": "...", "tilt": 60, "heading": 45, "altitude": 500},
  {"name": "...", "why": "...", "tilt": 30, "heading": -90, "altitude": 1200},
  {"name": "...", "why": "...", "tilt": 75, "heading": 180, "altitude": 300}
]`

    const contents = [{ parts: [{ text: prompt }] }]
    if (base64) {
      contents[0].parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64 } })
    }

    const resp = await fetch('/api/gemini?model=gemini-2.5-flash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { responseMimeType: 'application/json' }
      })
    })

    if (!resp.ok) throw new Error(`API error ${resp.status}`)

    const result = await resp.json()
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('No response from AI')

    const suggestions = JSON.parse(text)
    renderSuggestions(suggestions)
  } catch (e) {
    console.error('[scene-suggestions]', e)
    toastError('Could not get suggestions: ' + e.message.substring(0, 60))
  } finally {
    suggesting = false
    suggestBtn.disabled = false
    suggestBtn.textContent = ''
    const icon = document.createElement('span')
    icon.className = 'suggest-icon'
    icon.textContent = '\u2728'
    suggestBtn.insertBefore(icon, suggestBtn.firstChild)
    suggestBtn.appendChild(document.createTextNode(' Try this angle'))
  }
}

function renderSuggestions(suggestions) {
  if (!suggestPanel) return
  while (suggestPanel.firstChild) suggestPanel.removeChild(suggestPanel.firstChild)

  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'suggest-empty'
    empty.textContent = 'No suggestions available'
    suggestPanel.appendChild(empty)
    suggestPanel.style.display = 'block'
    return
  }

  suggestions.forEach(s => {
    const card = document.createElement('button')
    card.className = 'suggest-card'
    card.type = 'button'

    const name = document.createElement('div')
    name.className = 'suggest-name'
    name.textContent = s.name || 'Suggestion'

    const why = document.createElement('div')
    why.className = 'suggest-why'
    why.textContent = s.why || ''

    const params = document.createElement('div')
    params.className = 'suggest-params'
    params.textContent = `${s.tilt}\u00b0 tilt \u00b7 ${s.heading}\u00b0 heading \u00b7 ${s.altitude}m`

    card.appendChild(name)
    card.appendChild(why)
    card.appendChild(params)

    card.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('camera-set', {
        detail: {
          tilt: s.tilt ?? 51,
          heading: s.heading ?? 67,
          altitude: s.altitude ?? 700,
        }
      }))
      toastSuccess(`Applied: ${s.name}`)
    })

    suggestPanel.appendChild(card)
  })

  suggestPanel.style.display = 'block'
}

// CSS
const style = document.createElement('style')
style.textContent = `
  .suggest-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 9px 12px;
    margin-top: 10px;
    background: rgba(200, 184, 151, 0.08);
    border: 0.5px solid rgba(200, 184, 151, 0.2);
    border-radius: 7px;
    color: var(--accent, #c8b897);
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }
  .suggest-btn:hover {
    background: rgba(200, 184, 151, 0.15);
    border-color: rgba(200, 184, 151, 0.35);
  }
  .suggest-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .suggest-icon { font-size: 13px; }

  .suggest-panel {
    display: none;
    margin-top: 8px;
  }
  .suggest-card {
    display: block;
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    margin-bottom: 4px;
    background: rgba(255, 255, 255, 0.025);
    border: 0.5px solid rgba(255, 255, 255, 0.06);
    border-radius: 7px;
    cursor: pointer;
    font-family: inherit;
    color: inherit;
    transition: all 0.15s;
  }
  .suggest-card:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(200, 184, 151, 0.3);
  }
  .suggest-name {
    font-size: 11px;
    color: var(--ink, #eceae3);
    font-weight: 500;
    margin-bottom: 2px;
  }
  .suggest-why {
    font-size: 10px;
    color: var(--ink-soft, rgba(236,234,227,0.62));
    line-height: 1.4;
    margin-bottom: 4px;
  }
  .suggest-params {
    font-size: 9px;
    color: var(--ink-dim, rgba(236,234,227,0.38));
    font-family: 'SF Mono', ui-monospace, monospace;
  }
  .suggest-empty {
    font-size: 10px;
    color: var(--ink-dim);
    padding: 8px;
    text-align: center;
    font-style: italic;
  }
`
document.head.appendChild(style)
