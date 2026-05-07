// Phase 6.2 stub. Customer-portal session for Pro users to manage their
// subscription (cancel, update card, view invoices).
//
//   1. Read STRIPE_SECRET_KEY.
//   2. Verify Supabase session cookie → supabase user id.
//   3. Look up profiles.stripe_customer_id for that user. If missing
//      (somehow), return 404.
//   4. stripe.billingPortal.sessions.create({
//        customer: stripeCustomerId,
//        return_url: '<origin>/profile',
//      })
//   5. Return { url: session.url }.

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }
  res.statusCode = 501
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({
    error: 'stripe_portal_not_configured',
    message:
      'Stripe customer portal is not yet configured. See docs/superpowers/plans/2026-05-06-monetization-handoff.md.',
  }))
}
