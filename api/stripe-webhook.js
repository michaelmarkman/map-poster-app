// Phase 6.2 stub. Real implementation lives in
// docs/superpowers/plans/2026-05-06-monetization-handoff.md.
//
// What this needs to do once Stripe is wired:
//
//   1. Read STRIPE_WEBHOOK_SECRET from env.
//   2. Read the raw body + signature from the request, verify with
//      stripe.webhooks.constructEvent(rawBody, sig, secret). Reject 400
//      on bad signature.
//   3. Switch on event.type:
//
//        checkout.session.completed
//          → write profiles.tier = 'pro' for the customer (mapped via
//            session.client_reference_id == supabase user id)
//          → store profiles.stripe_customer_id = session.customer
//
//        customer.subscription.updated
//          → mirror status. If status === 'active' or 'trialing', tier
//            stays 'pro'. Else 'free'.
//
//        customer.subscription.deleted
//          → tier = 'free'.
//
//   4. Always return 200 quickly so Stripe doesn't retry.
//
// Until the env vars are present, return 501 so misconfigured deploys
// don't accidentally accept hooks.

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }
  res.statusCode = 501
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({
    error: 'stripe_webhook_not_configured',
    message:
      'Stripe webhook is not yet configured. See docs/superpowers/plans/2026-05-06-monetization-handoff.md.',
  }))
}
