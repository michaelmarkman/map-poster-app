// Phase 6.2 stub. Real implementation lives in
// docs/superpowers/plans/2026-05-06-monetization-handoff.md.
//
// What this needs to do once Stripe is wired:
//
//   1. Read STRIPE_SECRET_KEY from env (server-only).
//   2. Verify the request comes from a logged-in Supabase user (read the
//      session from the request cookies).
//   3. Read the requested price id from request body
//      (VITE_STRIPE_PRICE_MONTHLY / _ANNUAL — both are public env vars
//      so the client can pick which one).
//   4. Call stripe.checkout.sessions.create({
//        mode: 'subscription',
//        client_reference_id: supabaseUserId,
//        customer_email: user.email,
//        line_items: [{ price, quantity: 1 }],
//        success_url: '<origin>/profile?upgraded=1',
//        cancel_url: '<origin>/profile?upgraded=0',
//      })
//   5. Return { url: session.url }.
//
// Returning 501 today so the upgrade button on the profile page can fail
// loudly rather than appear-to-work. Once the env vars are set, replace
// the body of this function.

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }
  res.statusCode = 501
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({
    error: 'stripe_checkout_not_configured',
    message:
      'Stripe Checkout is not yet configured. See docs/superpowers/plans/2026-05-06-monetization-handoff.md.',
  }))
}
