// Vercel serverless: /api/og?id=POST_ID
// Returns an HTML page with OG meta tags for social sharing previews.
// Social crawlers get the meta tags; browsers get redirected to the community page.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.VITE_SUPABASE_ANON_KEY || ''
)

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`)
  const postId = url.searchParams.get('id')

  if (!postId) {
    res.statusCode = 400
    res.end('Missing id parameter')
    return
  }

  let post
  try {
    const result = await supabase
      .from('community_posts')
      .select('title, description, image_url, location_name, profiles(display_name, username)')
      .eq('id', postId)
      .single()
    if (result.error) {
      res.statusCode = 404
      res.end('Post not found')
      return
    }
    post = result.data
  } catch (e) {
    // Supabase throws on network failure / missing config; degrade to
    // a 503 rather than a 500 stack-trace leak so a misconfigured
    // deployment doesn't expose internals to social crawlers.
    res.statusCode = 503
    res.end('Service unavailable')
    return
  }
  if (!post) {
    res.statusCode = 404
    res.end('Post not found')
    return
  }

  const title = post.title || 'Vedute creation'
  const desc = post.description || `An aerial poster of ${post.location_name || 'a beautiful location'}`
  const image = post.image_url || ''
  const author = post.profiles?.display_name || post.profiles?.username || 'Vedute'
  // Redirect target: the React /community route, NOT the legacy
  // /community.html prototype (which still carries the old MapPoster
  // brand and isn't part of the live product). When Phase 7.3 lands a
  // dedicated /v/:id route, swap this for that.
  const canonicalUrl = `https://${req.headers.host}/community?post=${postId}`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
  res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${esc(title)} by ${esc(author)} — Vedute</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${esc(image)}">
  <meta property="og:url" content="${esc(canonicalUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${esc(image)}">
  <meta http-equiv="refresh" content="0;url=${esc(canonicalUrl)}">
</head>
<body>
  <p>Redirecting to <a href="${esc(canonicalUrl)}">${esc(title)}</a>...</p>
</body>
</html>`)
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
