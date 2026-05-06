#!/usr/bin/env node
// Prod-build smoke test. Catches bugs that only exist after minification /
// bundling — the things unit tests can't see:
//   - CSS minifier stripping vendor-prefixed rules
//   - React concurrent rendering dropping during-render ref writes
//   - Missing/wrong asset paths after rollup bundling
//   - Event-channel wiring between hooks and Scene
//
// Run after `npm run build`. Launches a headless Chromium, loads the editor
// from a local static server, and drives /app (the only editor as of Phase
// 1.2). /app-classic is gone — its checks were retired with it.
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
      if (/src.*empty string|favicon\.ico|TilesRenderer|Failed to fetch|CesiumIonAuth|3dtiles/i.test(text)) return
      consoleErrors.push(text)
    }
  })

  const goToApp = async () => {
    await page.goto(`http://127.0.0.1:${PORT}/src/index.html`)
    await page.evaluate(() => {
      history.pushState({}, '', '/app')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
  }

  // --- Phase 0: cold load ---
  console.log('cold load (/app)')
  await page.goto(`http://127.0.0.1:${PORT}/src/index.html`)
  await page.evaluate(() => { localStorage.clear() })
  await goToApp()
  await page.waitForFunction(
    () => !!document.querySelector('.mock-cluster .mock-pill'),
    null,
    { timeout: 10_000 },
  )
  const pillCount = await page.evaluate(() => document.querySelectorAll('.mock-cluster .mock-pill').length)
  check('pill editor renders at /app', pillCount >= 5, `only ${pillCount} pills found`)
  check('frame overlay present', await page.evaluate(() => !!document.querySelector('.mock-frame-overlay')))
  await page.waitForFunction(() => !!document.querySelector('#r3f-root canvas'), null, { timeout: 30_000 })
  check('canvas mounts', true)

  // --- Phase 1: legacy /app-classic redirects to /app ---
  console.log('/app-classic → /app redirect')
  await page.goto(`http://127.0.0.1:${PORT}/src/index.html`)
  await page.evaluate(() => {
    history.pushState({}, '', '/app-classic')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.waitForFunction(() => location.pathname === '/app', null, { timeout: 5_000 })
  check('/app-classic redirects to /app', true)

  // --- Phase 1b: lazy-loaded routes resolve cleanly ---
  // After the route-level code-splitting work, /community + /gallery +
  // /profile are each their own chunk. If the build emits asset paths
  // the deploy can't serve (or rolldown's hashed filenames don't
  // round-trip the static server), navigation fails with a chunk 404.
  // This catches that class of bug — any of these failing means the
  // user gets a blank page or stuck Suspense fallback in prod.
  console.log('lazy-loaded routes')
  for (const [path, marker] of [
    ['/community',       'h1'],
    ['/',                'h1'],
    ['/reset-password',  'h1'],   // eager auth route — verifies no
    //                              regression in the auth-page chunk
  ]) {
    await page.goto(`http://127.0.0.1:${PORT}/src/index.html`)
    await page.evaluate((p) => {
      history.pushState({}, '', p)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, path)
    let ok = false
    try {
      await page.waitForFunction(
        (m) => !!document.querySelector(m),
        marker,
        { timeout: 5_000 },
      )
      ok = true
    } catch {}
    check(`${path} renders`, ok, 'no h1 mounted within 5s')
  }

  // Brand-text guard. The landing page's <h1> must read 'Vedute' — locks
  // the Phase 1.1 rebrand at the production-build level. Unit tests cover
  // the source, this covers the prod bundle (catches a future minify /
  // tree-shake / SSR step that might mangle the literal).
  await page.goto(`http://127.0.0.1:${PORT}/src/index.html`)
  await page.evaluate(() => {
    history.pushState({}, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.waitForFunction(() => !!document.querySelector('h1'), null, { timeout: 5_000 })
  const heroText = await page.evaluate(() => document.querySelector('h1')?.textContent?.trim())
  check('landing hero reads "Vedute"', heroText === 'Vedute', `got: "${heroText}"`)

  // --- Phase 2: session persistence writes (driven by save-view) ---
  // Note: full restore-roundtrip is covered by the useSessionPersistence
  // unit tests; here we just verify the persistence hook is wired up at
  // all by triggering save-view and confirming localStorage gets written.
  console.log('saved views + session write')
  // Re-navigate to /app — the lazy-routes phase above ended somewhere
  // else (e.g. on /). Without this, waitForFunction(canvas) below
  // times out on the previous page's DOM.
  await goToApp()
  // Scene's get-camera listener attaches inside useEffect after Canvas
  // mounts. Wait for the canvas, then a generous beat for the listener
  // to attach before save-view tries to roundtrip.
  await page.waitForFunction(() => !!document.querySelector('#r3f-root canvas'), null, { timeout: 30_000 })
  await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 1500))
    localStorage.removeItem('vedute_views')
    window.dispatchEvent(new CustomEvent('save-view'))
    // 2s gives the persistence debounce (500ms) + Scene's get-camera
    // reply round-trip plenty of headroom on a slow CI runner.
    await new Promise(r => setTimeout(r, 2000))
  })
  const views = await page.evaluate(() => JSON.parse(localStorage.getItem('vedute_views') || '[]'))
  check('save-view persists a view', views.length === 1, `count=${views.length}`)
  check('saved view has camera', !!views[0]?.camera, JSON.stringify(views[0] || {}).slice(0, 80))
  check('saved view has auto-derived coord name', /°[NS]\s+\d+\.\d+°[EW]/.test(views[0]?.name || ''), views[0]?.name)
  const sessionBlob = await page.evaluate(() => JSON.parse(localStorage.getItem('vedute_session') || 'null'))
  check('session blob written to localStorage', !!sessionBlob, 'session key missing')
  check(
    'session has camera position',
    Array.isArray(sessionBlob?.camera?.position) && sessionBlob.camera.position.length === 3,
    `camera=${JSON.stringify(sessionBlob?.camera || null).slice(0, 200)}`,
  )

  // --- Phase 3: static-asset sanity ---
  // Catches builds where public/ assets aren't actually copied into
  // dist-deploy (the favicon move two iterations ago, the OG image
  // path used by the social-unfurl meta tag, etc.).
  console.log('static assets')
  for (const [path, label] of [
    ['/favicon.svg', 'favicon.svg ships'],
    ['/style-photos/vedute-realistic-2x-20260422-1705.png', 'OG image (vedute-realistic) ships'],
  ]) {
    const ok = await fetch(`http://127.0.0.1:${PORT}${path}`).then(r => r.status === 200).catch(() => false)
    check(label, ok, `GET ${path} did not return 200`)
  }

  // --- Phase 4: style bundle sanity ---
  console.log('styles')
  const cssText = await page.evaluate(async () => {
    const links = Array.from(document.querySelectorAll('link[rel=stylesheet]'))
    const bundles = await Promise.all(links.map(l => fetch(l.href).then(r => r.text())))
    return bundles.join('\n')
  })
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
