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

  const { data: post, error } = await supabase
    .from('community_posts')
    .select('title, description, image_url, location_name, profiles(display_name, username)')
    .eq('id', postId)
    .single()

  if (error || !post) {
    res.statusCode = 404
    res.end('Post not found')
    return
  }

  const title = post.title || 'MapPoster Creation'
  const desc = post.description || `A 3D map poster of ${post.location_name || 'a beautiful location'}`
  const image = post.image_url || ''
  const author = post.profiles?.display_name || post.profiles?.username || 'MapPoster'
  const canonicalUrl = `https://${req.headers.host}/community.html?post=${postId}`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
  res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${esc(title)} by ${esc(author)} — MapPoster</title>
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
