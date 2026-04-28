import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Dev-only middleware that forwards /api/gemini to the serverless handler at api/gemini.js.
// In production (Vercel) the /api/* file-based routing handles this automatically, but the
// Vite dev server has no such routing — so we mount the same handler here for parity.
const apiMiddleware = {
  name: 'api-middleware',
  configureServer(server) {
    server.middlewares.use('/api/gemini', async (req, res) => {
      try {
        const mod = await server.ssrLoadModule('/api/gemini.js')
        const handler = mod.default
        // server.middlewares strips the matched path prefix — restore it so the
        // handler's `new URL(req.url, ...)` can see the ?model=... querystring.
        const rawUrl = req.originalUrl || req.url || ''
        req.url = rawUrl.startsWith('/api/gemini') ? rawUrl : '/api/gemini' + rawUrl
        await handler(req, res)
      } catch (e) {
        console.error('[api/gemini] middleware error:', e)
        if (!res.headersSent) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
        }
        res.end(JSON.stringify({ error: 'middleware error', detail: String(e?.message || e) }))
      }
    })
  }
}

// Dev-only middleware: React Router client-side paths (`/`, `/app`, `/gallery`,
// `/community`, `/profile`, `/login`, `/signup`, `/forgot-password`) must fall
// through to `src/index.html` so the SPA can boot. `/prototypes/*` and
// `/api/*` and `/src/*` and static asset requests are left alone.
const spaFallback = {
  name: 'spa-fallback',
  configureServer(server) {
    const SPA_ROUTES = new Set([
      '/', '/app', '/app-classic', '/mock', '/dof-lab', '/gallery', '/community', '/profile',
      '/login', '/signup', '/forgot-password',
    ])
    server.middlewares.use(async (req, res, next) => {
      const url = req.url || '/'
      // Strip query string for matching
      const path = url.split('?')[0]
      if (!SPA_ROUTES.has(path)) return next()
      try {
        const html = readFileSync(resolve(process.cwd(), 'src/index.html'), 'utf-8')
        const transformed = await server.transformIndexHtml(url, html)
        res.setHeader('Content-Type', 'text/html')
        res.end(transformed)
      } catch (e) {
        next(e)
      }
    })
  },
}

export default ({ mode }) => {
  // Load .env / .env.local into process.env so the /api/gemini handler (and any
  // other serverless-style code) can read GEMINI_API_KEY just like it does on Vercel.
  // loadEnv by default only returns VITE_-prefixed vars; passing '' as the prefix
  // returns everything.
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of Object.keys(env)) {
    if (process.env[key] === undefined) process.env[key] = env[key]
  }

  return {
    plugins: [react(), apiMiddleware, spaFallback],
  }
}
