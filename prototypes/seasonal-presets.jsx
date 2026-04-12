// ─── Seasonal / Time Scene Presets ──────────────────────────
// One-click time+weather+location combos like "Golden Hour at Golden Gate"
// Sets time of day, clouds, and optionally AI style preset for the mood.

const SEASONAL_PRESETS = [
  {
    name: 'Golden Gate Sunset',
    icon: '\u{1F309}',
    detail: '6:45 PM \u00b7 fog + warm light',
    tod: 18.75,
    clouds: { on: true, coverage: 0.45, speed: 0.5 },
    location: 'Golden Gate Bridge, San Francisco',
    aiPreset: 'golden',
  },
  {
    name: 'Santorini Sunset',
    icon: '\u{1F3D6}',
    detail: '7:15 PM \u00b7 clear golden',
    tod: 19.25,
    clouds: { on: false },
    location: 'Santorini, Greece',
    aiPreset: 'golden',
  },
  {
    name: 'Midnight Tokyo',
    icon: '\u{1F303}',
    detail: '12:00 AM \u00b7 neon city glow',
    tod: 0,
    clouds: { on: false },
    location: 'Shibuya, Tokyo',
    aiPreset: 'night',
  },
  {
    name: 'Paris Dawn',
    icon: '\u{1F5FC}',
    detail: '6:30 AM \u00b7 misty morning',
    tod: 6.5,
    clouds: { on: true, coverage: 0.3, speed: 0.3 },
    location: 'Eiffel Tower, Paris',
    aiPreset: 'foggy',
  },
  {
    name: 'NYC Golden Hour',
    icon: '\u{1F307}',
    detail: '5:30 PM \u00b7 amber canyons',
    tod: 17.5,
    clouds: { on: true, coverage: 0.15, speed: 0.5 },
    location: 'Manhattan, New York',
    aiPreset: 'golden',
  },
  {
    name: 'London Rain',
    icon: '\u{1F327}',
    detail: '2:00 PM \u00b7 overcast drizzle',
    tod: 14,
    clouds: { on: true, coverage: 0.7, speed: 1.5 },
    location: 'Tower Bridge, London',
    aiPreset: 'rainy',
  },
  {
    name: 'Rome Afternoon',
    icon: '\u2600',
    detail: '3:00 PM \u00b7 warm Mediterranean',
    tod: 15,
    clouds: { on: true, coverage: 0.1, speed: 0.3 },
    location: 'Colosseum, Rome',
    aiPreset: null,
  },
  {
    name: 'Iceland Aurora',
    icon: '\u2728',
    detail: '11:00 PM \u00b7 clear arctic night',
    tod: 23,
    clouds: { on: false },
    location: 'Reykjavik, Iceland',
    aiPreset: 'night',
  },
  {
    name: 'Cherry Blossom Kyoto',
    icon: '\u{1F338}',
    detail: '10:00 AM \u00b7 spring morning',
    tod: 10,
    clouds: { on: true, coverage: 0.2, speed: 0.5 },
    location: 'Fushimi Inari, Kyoto',
    aiPreset: 'cherry',
  },
  {
    name: 'Dubai Dusk',
    icon: '\u{1F3D9}',
    detail: '7:30 PM \u00b7 desert twilight',
    tod: 19.5,
    clouds: { on: false },
    location: 'Burj Khalifa, Dubai',
    aiPreset: null,
  },
  {
    name: 'Snowy Prague',
    icon: '\u2744',
    detail: '11:00 AM \u00b7 winter wonderland',
    tod: 11,
    clouds: { on: true, coverage: 0.5, speed: 0.5 },
    location: 'Charles Bridge, Prague',
    aiPreset: 'snowfall',
  },
  {
    name: 'Autumn Central Park',
    icon: '\u{1F341}',
    detail: '4:00 PM \u00b7 fall foliage',
    tod: 16,
    clouds: { on: true, coverage: 0.2, speed: 0.5 },
    location: 'Central Park, New York',
    aiPreset: 'autumn',
  },
]

export function initSeasonalPresets(stateRef) {
  const grid = document.getElementById('seasonal-grid')
  if (!grid) return

  SEASONAL_PRESETS.forEach((preset, idx) => {
    const btn = document.createElement('button')
    btn.className = 'seasonal-btn'

    const icon = document.createElement('span')
    icon.className = 'seasonal-icon'
    icon.textContent = preset.icon
    btn.appendChild(icon)

    const info = document.createElement('div')
    info.className = 'seasonal-info'

    const name = document.createElement('span')
    name.className = 'seasonal-name'
    name.textContent = preset.name
    info.appendChild(name)

    const detail = document.createElement('span')
    detail.className = 'seasonal-detail'
    detail.textContent = preset.detail
    info.appendChild(detail)

    btn.appendChild(info)

    btn.addEventListener('click', () => applyPreset(preset, stateRef))
    grid.appendChild(btn)
  })
}

function applyPreset(preset, stateRef) {
  // Set time of day
  stateRef.timeOfDay = preset.tod
  const todSlider = document.getElementById('tod-slider')
  if (todSlider) todSlider.value = preset.tod
  const todVal = document.getElementById('tod-val')
  if (todVal) {
    const h = preset.tod
    const hh = Math.floor(h)
    const mm = Math.round((h - hh) * 60)
    const ap = hh >= 12 ? 'PM' : 'AM'
    const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
    todVal.textContent = h12 + ':' + String(mm).padStart(2, '0') + ' ' + ap
  }

  // Set clouds
  if (preset.clouds) {
    stateRef.clouds.on = preset.clouds.on
    if (preset.clouds.coverage !== undefined) stateRef.clouds.coverage = preset.clouds.coverage
    if (preset.clouds.speed !== undefined) stateRef.clouds.speed = preset.clouds.speed

    const toggleClouds = document.getElementById('toggle-clouds')
    if (toggleClouds) toggleClouds.classList.toggle('on', stateRef.clouds.on)

    const coverageSlider = document.getElementById('cloud-coverage-slider')
    if (coverageSlider) coverageSlider.value = stateRef.clouds.coverage * 100
    const coverageVal = document.getElementById('cloud-coverage-val')
    if (coverageVal) coverageVal.textContent = Math.round(stateRef.clouds.coverage * 100) + '%'

    const speedSlider = document.getElementById('cloud-speed-slider')
    if (speedSlider) speedSlider.value = stateRef.clouds.speed
    const speedVal = document.getElementById('cloud-speed-val')
    if (speedVal) speedVal.textContent = stateRef.clouds.speed + 'x'
  }

  // Fly to location
  if (preset.location) {
    const searchInput = document.getElementById('location-search')
    if (searchInput) searchInput.value = preset.location

    // Geocode and fly
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(preset.location)}&format=json&limit=1`, {
      headers: { 'User-Agent': 'MapPoster/1.0' }
    })
      .then(r => r.json())
      .then(results => {
        if (results?.[0]) {
          const lat = parseFloat(results[0].lat)
          const lng = parseFloat(results[0].lon)
          window.dispatchEvent(new CustomEvent('fly-to', { detail: { lat, lng } }))
        }
      })
      .catch(() => {})
  }

  // Activate AI preset if specified
  if (preset.aiPreset) {
    // Clear current selections
    document.querySelectorAll('.ai-preset.active').forEach(b => b.classList.remove('active'))
    // Activate the matching preset button
    const presetBtn = document.querySelector(`.ai-preset[data-preset="${preset.aiPreset}"]`)
    if (presetBtn) presetBtn.classList.add('active')
    // Set the prompt
    const geminiPrompt = document.getElementById('gemini-prompt')
    const presetData = window._AI_PRESETS?.[preset.aiPreset]
    if (geminiPrompt && presetData) {
      geminiPrompt.value = typeof presetData === 'string' ? presetData : presetData.prompt
    }
  }

  // Trigger effects update
  window.dispatchEvent(new Event('effects-changed'))

  // Show status
  showPresetToast(preset.name + ' applied')
}

function showPresetToast(msg) {
  const existing = document.getElementById('seasonal-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.id = 'seasonal-toast'
  toast.className = 'collab-toast' // reuse collab toast style
  toast.textContent = msg
  document.body.appendChild(toast)

  requestAnimationFrame(() => toast.classList.add('show'))
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 300)
  }, 2000)
}

export { SEASONAL_PRESETS }
