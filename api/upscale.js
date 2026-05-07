// Phase 5.1 stub. Real implementation: server-side image upscaling proxy.
//
// Why server-side? Free tier renders cap at 2× client-side. Pro tier wants
// up to 6× for print exports. Browsers can't do 6× consistently — memory
// blows up on mid-range devices. Server-side upscaling (fal.ai, Replicate,
// or a self-hosted Real-ESRGAN) lets us deliver print-grade resolution
// without the client-side memory tax.
//
// What this needs to do once a provider is wired:
//
//   1. Read UPSCALE_API_KEY (and UPSCALE_PROVIDER if multi-provider) from
//      env (server-only).
//   2. Verify the request comes from a logged-in Supabase user. Anonymous
//      users don't get server upscaling.
//   3. Read the request body:
//        - `imageDataUrl` or `imageUrl`: source image (we render at 2×
//          client-side, then post the result up for further upscaling)
//        - `targetMultiplier`: 4 or 6 (we don't upscale below 4 — that's
//          what the client can do)
//   4. Verify entitlements:
//        - canUseResolution({ multiplier: targetMultiplier }) must be true
//          for this user's tier
//   5. Call the upscale provider, e.g. fal.ai:
//        POST https://fal.run/fal-ai/clarity-upscaler
//          { image_url, scale: 2 }  // we already have 2×, scale by 2 → 4×
//      Or Replicate:
//        POST https://api.replicate.com/v1/predictions
//          { version: '<real-esrgan-version>', input: { image, scale: 2 } }
//   6. Stream the result back, OR upload to Supabase Storage and return a
//      signed URL. (Streaming is simpler; storage saves the user from
//      re-downloading if they re-share.)
//   7. Return { url: '<signed-storage-url>' } or { dataUrl: '<base64>' }.
//
// Pricing reality check (mid-2026):
//   - fal.ai clarity-upscaler: ~$0.04 / image
//   - Replicate Real-ESRGAN x4plus: ~$0.0017 / image (cold) / ~$0.0008 (warm)
//   Replicate is cheaper but slower; fal.ai is faster but ~25× the price.
//   Default to Replicate for cost-control. Add fal.ai as a "fast lane"
//   for Pro+ if needed.
//
// Returning 501 today so the client knows to skip the upscale path and
// just deliver the 2× client-side render.

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }
  res.statusCode = 501
  res.setHeader('Content-Type', 'application/json')
  res.end(
    JSON.stringify({
      error: 'upscale_not_configured',
      message:
        'Server-side upscaling is not yet configured. Free / Pro users will receive 2× client-side renders. See api/upscale.js for the wire-up plan.',
    }),
  )
}
