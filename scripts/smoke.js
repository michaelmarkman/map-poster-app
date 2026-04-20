#!/usr/bin/env node
// Prod-build smoke test. Catches bugs that only exist after minification /
// bundling — the things unit tests can't see:
//   - CSS minifier stripping vendor-prefixed rules
//   - React concurrent rendering dropping during-render ref writes
//   - Missing/wrong asset paths after rollup bundling
//   - Event-channel wiring between hooks and Scene
//
// Run after `npm run build`. Launches a headless Chromium, loads the editor
// from a local static server, and drives two canaries:
//   - /app (pill editor, the new default) — render + no console errors
//   - /app-classic (legacy sidebar editor) — change TOD, toggle clouds,
//     set aspect, reload, verify restored, save a view, confirm list update
// Exits 1 on the first failure.
//
// Usage: node scripts/smoke.js [--headed]

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

const ROOT = resolve(import.meta.dirname, '..')
const DIST = resolve(ROOT, 'dist-deploy')
const PORT = 8789
const HEADED = process.argv.includes('--headed')

if (!existsSync(DIST)) {
  console.error('dist-deploy/ missing — run `npm run build` first.')
  process.exit(1)
}

// Start the static server. Python's http.server is preinstalled everywhere,
// no extra dep for the smoke script.
const server = spawn('python3', ['-m', 'http.server', String(PORT)], {
  cwd: DIST,
  stdio: ['ignore', 'ignore', 'ignore'],
})
process.on('exit', () => server.kill())
process.on('SIGINT', () => { server.kill(); process.exit(130) })

// Wait for port to be up.
async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/src/index.html`)
      if (r.status === 200) return
    } catch {}
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('server never came up')
}

const failures = []
function check(label, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${label}`)
  } else {
    console.log(`  ✗ ${label}  (${detail ?? 'failed'})`)
    failures.push(label)
  }
}

async function run() {
  await waitForServer()
  const browser = await chromium.launch({ headless: !HEADED })
  const page = await browser.newPage()

  // Surface console errors so a silent crash doesn't look like success.
  const consoleErrors = []
  page.on('pageerror', (err) => consoleErrors.push(String(err)))
  // Track failed requests so any 404s show their URL in the diagnostic.
  page.on('requestfailed', (req) => {
    const url = req.url()
    if (/favicon\.ico|TilesRenderer|3dtiles|googleapis|gstatic/i.test(url)) return
    consoleErrors.push(`requestfailed: ${url} ${req.failure()?.errorText || ''}`)
  })
  page.on('response', (resp) => {
    if (resp.status() < 400) return
    const url = resp.url()
    if (/favicon\.ico|TilesRenderer|3dtiles|googleapis|gstatic/i.test(url)) return
    consoleErrors.push(`HTTP ${resp.status()}: ${url}`)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // Benign / environmental:
      //   - React's empty-src warning during modal mount
      //   - favicon.ico 404 (we don't ship one yet)
      //   - Google 3D Tiles fetches that fail outside a real hosting origin
      //     (the smoke runs against a static http.server and doesn't hold
      //     a valid Google Cloud session token — the editor still renders
      //     its UI; the globe geometry just doesn't stream in)
      //   - bare TypeError: Failed to fetch from those same tile requests
      if (/src.*empty string|favicon\.ico|TilesRenderer|Failed to fetch|CesiumIonAuth|3dtiles/i.test(text)) return
      consoleErrors.push(text)
    }
  })

  // --- Phase 0: pill editor at /app ---
  console.log('pill editor (/app)')
  await page.goto(`http://127.0.0.1:${PORT}/src/index.html`)
  await page.evaluate(() => { localStorage.clear() })
  await page.goto(`http://127.0.0.1:${PORT}/src/index.html`)
  await page.evaluate(() => {
    history.pushState({}, '', '/app')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  // Wait for any pill cluster to render — confirms MockEditorShell mounted
  // and at least one of the corner clusters painted.
  await page.waitForFunction(
    () => !!document.querySelector('.mock-cluster .mock-pill'),
    null,
    { timeout: 10_000 },
  )
  const pillCount = await page.evaluate(() => document.querySelectorAll('.mock-cluster .mock-pill').length)
  check('pill editor renders at /app', pillCount >= 5, `only ${pillCount} pills found`)
  check('frame overlay present', await page.evaluate(() => !!document.querySelector('.mock-frame-overlay')))

  // --- Phase 1: cold load + save (sidebar editor at /app-classic) ---
  console.log('sidebar editor (/app-classic) — cold load')
  await page.goto(`http://127.0.0.1:${PORT}/src/index.html`)
  await page.evaluate(() => { localStorage.clear() })
  await page.goto(`http://127.0.0.1:${PORT}/src/index.html`)
  await page.evaluate(() => {
    history.pushState({}, '', '/app-classic')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  // Sidebar takes a beat for React Router + lazy bits; give it room.
  await page.waitForFunction(() => !!document.getElementById('tod-slider'), null, { timeout: 10_000 })
  check('sidebar renders at /app-classic', true)

  await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 2500)) // let scene mount + initial save settle
    const slider = document.getElementById('tod-slider')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(slider, '18')
    slider.dispatchEvent(new Event('input', { bubbles: true }))
    document.getElementById('toggle-clouds').click()
    document.querySelector('[data-ratio="1.778"]').click()
    await new Promise(r => setTimeout(r, 1100))
  })

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mapposter3d_poster_v2_session') || 'null'))
  check('session saves to localStorage', !!saved, 'session key missing')
  check('TOD=18 saved', saved?.state?.timeOfDay === 18, saved?.state?.timeOfDay)
  check('clouds off saved', saved?.state?.clouds?.on === false, saved?.state?.clouds?.on)
  check('aspect=1.778 saved', saved?.ui?.aspectRatio === 1.778, saved?.ui?.aspectRatio)
  check('camera position saved', Array.isArray(saved?.camera?.position) && saved.camera.position.length === 3)

  // --- Phase 2: reload + restore ---
  console.log('reload')
  await page.goto(`http://127.0.0.1:${PORT}/src/index.html`)
  await page.evaluate(() => {
    history.pushState({}, '', '/app-classic')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  // Generous timeouts — CI (small VM, no GPU) takes much longer than local
  // for the sidebar to mount and session restore to apply.
  await page.waitForSelector('#tod-slider', { timeout: 15_000 })
  await page.waitForFunction(() => document.getElementById('tod-slider')?.value !== '12', null, { timeout: 15_000 })

  const restored = await page.evaluate(() => ({
    tod: document.getElementById('tod-slider')?.value,
    label: document.getElementById('tod-val')?.textContent,
    cloudsOn: document.getElementById('toggle-clouds')?.classList.contains('on'),
    activeRatio: document.querySelector('.size-btn.active')?.dataset.ratio,
  }))
  check('TOD restored', restored.tod === '18', restored.tod)
  check('TOD label restored', restored.label === '6:00 PM', restored.label)
  check('clouds off restored', restored.cloudsOn === false, restored.cloudsOn)
  check('aspect restored', restored.activeRatio === '1.778', restored.activeRatio)

  // --- Phase 3: saved views ---
  console.log('saved views')
  // Scene's get-camera listener attaches inside useEffect after Canvas
  // mounts. The reload above leaves us mid-mount — give the scene room
  // to finish attaching before save-view tries to roundtrip.
  await page.waitForFunction(() => {
    // Proxy for "Scene has mounted": canvas element exists inside r3f-root.
    return !!document.querySelector('#r3f-root canvas')
  }, null, { timeout: 30_000 })
  await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 1000))
    localStorage.removeItem('mapposter3d_v2_views')
    window.dispatchEvent(new CustomEvent('save-view'))
    await new Promise(r => setTimeout(r, 800))
  })
  const views = await page.evaluate(() => JSON.parse(localStorage.getItem('mapposter3d_v2_views') || '[]'))
  check('save-view persists a view', views.length === 1, `count=${views.length}`)
  check('saved view has camera', !!views[0]?.camera, JSON.stringify(views[0] || {}).slice(0, 80))
  check('saved view has auto-derived coord name', /°[NS]\s+\d+\.\d+°[EW]/.test(views[0]?.name || ''), views[0]?.name)

  // --- Phase 4: style bundle sanity ---
  console.log('styles')
  const cssText = await page.evaluate(async () => {
    const links = Array.from(document.querySelectorAll('link[rel=stylesheet]'))
    const bundles = await Promise.all(links.map(l => fetch(l.href).then(r => r.text())))
    return bundles.join('\n')
  })
  // rolldown's default CSS minifier deduped prefixed properties, so both
  // forms must still be present after build.
  check('CSS has backdrop-filter:', /[^-]backdrop-filter:/.test(cssText))
  check('CSS has -webkit-backdrop-filter:', /-webkit-backdrop-filter:/.test(cssText))

  // --- Phase 5: console hygiene ---
  console.log('console')
  check('no page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

  await browser.close()
}

try {
  await run()
} catch (e) {
  console.error('smoke crashed:', e)
  failures.push('exception: ' + e.message)
} finally {
  server.kill()
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`)
  process.exit(1)
}
console.log('\nall smoke checks passed')
