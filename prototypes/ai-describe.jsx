// ─── AI-Powered Description Generator ───────────────────────
// When sharing to community, auto-generate a compelling description
// using Gemini based on the location + style + camera settings.

export function initAIDescribe() {
  const btn = document.getElementById('ai-describe-btn')
  const output = document.getElementById('ai-description-output')
  const textEl = document.getElementById('ai-description-text')
  const copyBtn = document.getElementById('ai-description-copy')

  if (!btn) return

  btn.addEventListener('click', async () => {
    const location = document.getElementById('location-search')?.value || 'Unknown location'
    const tod = document.getElementById('tod-slider')?.value || '12'
    const activePresets = [...document.querySelectorAll('.ai-preset.active')].map(b => b.textContent.trim())
    const style = activePresets.length ? activePresets.join(', ') : 'default'

    // Gather context
    const todHour = parseFloat(tod)
    const timeLabel = getTimeLabel(todHour)
    const aspectBtn = document.querySelector('.size-btn.active')
    const aspect = aspectBtn?.textContent || 'default'

    btn.textContent = 'Generating...'
    btn.disabled = true

    try {
      const description = await generateDescription(location, timeLabel, style, aspect)
      if (textEl) textEl.textContent = description
      if (output) output.style.display = 'block'
    } catch (e) {
      // Fallback: generate locally without API
      const description = generateLocalDescription(location, timeLabel, style, aspect)
      if (textEl) textEl.textContent = description
      if (output) output.style.display = 'block'
    } finally {
      btn.textContent = 'Generate Description'
      btn.disabled = false
    }
  })

  copyBtn?.addEventListener('click', () => {
    const text = textEl?.textContent
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = 'Copied!'
      setTimeout(() => { copyBtn.textContent = 'Copy' }, 1500)
    }).catch(() => {})
  })
}

async function generateDescription(location, time, style, aspect) {
  const prompt = buildPrompt(location, time, style, aspect)

  const payload = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 300,
    }
  })

  const resp = await fetch('/api/gemini?model=gemini-2.0-flash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  })

  if (!resp.ok) throw new Error('API error ' + resp.status)

  const result = await resp.json()
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('No text returned')
  return text.trim()
}

function buildPrompt(location, time, style, aspect) {
  return `Write a compelling, evocative 2-3 sentence description for a 3D aerial map poster of "${location}".

Context:
- Time of day: ${time}
- Art style: ${style}
- Aspect ratio: ${aspect}

The description should:
- Be poetic but concise, suitable for a social media post or print-on-demand listing
- Mention the location and capture its character
- Reference the mood/atmosphere created by the time of day and style
- Be written in second person ("you") or descriptive third person
- NOT include hashtags, emojis, or marketing language like "buy now"

Just output the description text, nothing else.`
}

function generateLocalDescription(location, time, style, aspect) {
  const city = location.split(',')[0].trim()
  const moods = {
    'Early morning': 'bathed in the soft glow of dawn',
    'Morning': 'alive with morning light',
    'Late morning': 'warming under the late morning sun',
    'Noon': 'under the clarity of midday light',
    'Early afternoon': 'cast in warm afternoon hues',
    'Late afternoon': 'gilded by the late afternoon sun',
    'Golden hour': 'transformed by golden hour\'s amber embrace',
    'Sunset': 'painted in the dramatic colors of sunset',
    'Dusk': 'settling into the blue quiet of dusk',
    'Evening': 'glittering beneath the evening sky',
    'Night': 'illuminated against the velvet darkness',
  }
  const mood = moods[time] || 'captured from above'

  const styleDesc = style !== 'default' ? `, rendered in ${style.toLowerCase()} style` : ''

  const templates = [
    `${city} ${mood}${styleDesc}. Every rooftop and street corner tells a story of the city that never stops moving, frozen in a single perfect moment from above.`,
    `A bird's eye view of ${city} ${mood}${styleDesc}. The urban geometry unfolds like a living map, where architecture meets atmosphere in this aerial portrait.`,
    `${city} reveals its hidden patterns when seen from this vantage point, ${mood}${styleDesc}. A cartographic love letter to one of the world's great places.`,
  ]

  return templates[Math.floor(Math.random() * templates.length)]
}

function getTimeLabel(hour) {
  if (hour < 6) return 'Night'
  if (hour < 8) return 'Early morning'
  if (hour < 10) return 'Morning'
  if (hour < 11.5) return 'Late morning'
  if (hour < 13) return 'Noon'
  if (hour < 15) return 'Early afternoon'
  if (hour < 17) return 'Late afternoon'
  if (hour < 18.5) return 'Golden hour'
  if (hour < 19.5) return 'Sunset'
  if (hour < 20.5) return 'Dusk'
  if (hour < 22) return 'Evening'
  return 'Night'
}
