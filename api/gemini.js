// Server-side proxy for Gemini so the API key never ships in the client bundle.
// Keep this at the repo root under /api — Vercel auto-detects these as
// serverless functions regardless of the Vite static output directory.

const WINDOW_MS = 60 * 1000
const MAX_PER_WINDOW = 10
const rateBuckets = new Map() // ip -> number[] of timestamps within window

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
}

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export default async function handler(req, res) {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'method not allowed' }))
  }

  // Per-IP rate limit (resets on cold start — fine for friends testing)
  const fwd = req.headers['x-forwarded-for']
  const ip = (typeof fwd === 'string' && fwd.split(',')[0].trim()) ||
             req.socket?.remoteAddress || 'unknown'
  const now = Date.now()
  const hits = (rateBuckets.get(ip) || []).filter(t => now - t < WINDOW_MS)
  if (hits.length >= MAX_PER_WINDOW) {
    res.statusCode = 429
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'rate limit' }))
  }
  hits.push(now)
  rateBuckets.set(ip, hits)

  const key = process.env.GEMINI_API_KEY
  if (!key) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }))
  }

  // Model comes via ?model= so the client passes the raw Gemini payload through unchanged.
  const url = new URL(req.url, 'http://localhost')
  const model = url.searchParams.get('model')
  if (!model || !/^[A-Za-z0-9._-]+$/.test(model)) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'invalid model' }))
  }

  // Body: Vercel may have already parsed it to an object; otherwise read the stream.
  let body
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    body = JSON.stringify(req.body)
  } else if (typeof req.body === 'string') {
    body = req.body
  } else if (Buffer.isBuffer(req.body)) {
    body = req.body.toString('utf8')
  } else {
    body = await readRawBody(req)
  }

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }
    )
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    return res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'upstream error', detail: String(e?.message || e) }))
  }
}
