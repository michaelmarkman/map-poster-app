# Vedute Monetization + Social — Handoff

The autonomous Phase 1–5 implementation pass scaffolded what could be done
locally. The items below need work that requires real external accounts /
API keys / DB schema, so they're left as targeted TODOs.

## Phase 6 — Monetization

### 6.1 Free-tier limits ✅ (scaffolded)

`src/lib/entitlements.js` is the single source of truth for tier limits:

- Free: 5 renders/month, max 2× resolution, watermark on, 5 saved views
- Pro: unlimited renders, up to 6× resolution, no watermark, unlimited views

**Numbers are placeholders.** Tune before launch based on Gemini cost-per-image
+ pricing strategy. Once tuned, the only files that need to change to roll
out a new tier are this one + (eventually) the Stripe price IDs.

### 6.2 Stripe integration — TODO

You'll need:

1. A Stripe account (test mode is fine to start)
2. One subscription product ("Vedute Pro") with monthly + annual prices
3. Webhook endpoint set up in Stripe dashboard pointing at `/api/stripe-webhook`
4. Env vars in Vercel:
   - `STRIPE_SECRET_KEY` — server-only
   - `STRIPE_WEBHOOK_SECRET` — server-only
   - `VITE_STRIPE_PRICE_MONTHLY` — public
   - `VITE_STRIPE_PRICE_ANNUAL` — public

Code stubs to write:

- `api/stripe-checkout.js` — accepts a price id, creates a Stripe Checkout
  session, returns the redirect URL. Auth-gated (must have a logged-in
  Supabase user; pass user id as `client_reference_id`).
- `api/stripe-webhook.js` — verifies signature, handles
  `checkout.session.completed` + `customer.subscription.updated` +
  `customer.subscription.deleted`. Each writes back to Supabase
  `profiles.tier` ('pro' or 'free') and `profiles.stripe_customer_id`.
- `api/stripe-portal.js` — creates a customer-portal session for the
  logged-in user; profile page links to it as "Manage subscription".

Supabase schema additions to the existing `profiles` table:

```sql
ALTER TABLE profiles
  ADD COLUMN tier text DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
  ADD COLUMN stripe_customer_id text;
```

### 6.3 BYOK toggle — TODO

`aiApiKeyAtom` already exists (`src/pages/editor/atoms/sidebar.js`) and
its key is persisted under `vedute_gemini_key` in localStorage. The
entitlements layer (`src/lib/entitlements.js`) already short-circuits the
render-submit and watermark gates when `byokKey` is truthy.

What's missing:

- A settings UI surface for the BYOK input. Suggested home: profile page
  (`src/pages/profile/ProfilePage.jsx`) under a "Bring your own Gemini
  key" section. Mirror the input that's already inside AIRenderModal so
  the two stay in sync via the atom.
- A clear "key invalid" error path when the user's key returns 401/403.
  Today the request fails silently; surface "Your Gemini key was rejected
  — check it in your profile."
- Wire the render-submit gate. Today `useQueue.js` doesn't actually call
  `canSubmitRender`. When you wire Stripe entitlement state in (Phase
  6.2), thread `profile` + monthly render count + `aiKey` from atoms
  into the gate at the top of `onAddToQueue` / `onAddBatchToQueue`.

## Phase 7 — Social

### 7.1 Profile page — partial scaffold needed

`src/pages/profile/ProfilePage.jsx` is currently a stub. Build:

- Display name + avatar (already wired via AuthContext.uploadAvatar)
- Tier badge ('Free' / 'Pro') derived from profile
- Manage subscription link (Stripe customer portal — needs 6.2)
- BYOK key field (needs 6.3)
- "My posters" — paginated grid of the user's gallery entries

Supabase schema for posters:

```sql
CREATE TABLE gallery_entries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users NOT NULL,
  image_url text NOT NULL,           -- Supabase storage URL
  thumbnail_url text,
  location_name text,
  created_at timestamptz DEFAULT now(),
  view_blob jsonb,                   -- the saved-view payload
  is_public boolean DEFAULT false,
  title text,
  description text
);
ALTER TABLE gallery_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see their own"
  ON gallery_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "anyone sees public"
  ON gallery_entries FOR SELECT TO anon USING (is_public = true);
CREATE POLICY "users insert own"
  ON gallery_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update/delete own"
  ON gallery_entries FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

The local IndexedDB gallery (in `useGalleryData`) should sync up to this
table on save. Pick a strategy:
- **Cloud-first**: write to Supabase on render-complete, read on profile
  load. IDB becomes a write-through cache.
- **IDB-first**: keep IDB as source of truth; add an opt-in "Save to
  cloud" button on each gallery card.

### 7.2 Community page — needs 7.1 first

Build on `src/pages/community/CommunityPage.jsx`:

- Public feed of `gallery_entries WHERE is_public = true` ordered by
  created_at desc, paginated
- Per-poster card: image, location, author handle, "Open in editor" button
- `is_public` toggle on the gallery card / lightbox so users can opt in
- Filters: location text search, date range

### 7.3 Share button + social meta tags — partial

Today: `api/og.js` exists and renders a /community/<id>?post=<id> meta
page. Wire up:

- Per-gallery-card Share button → opens a modal with:
  - Direct download (PNG)
  - "Copy share link" (the public /v/<id> URL)
  - Pre-formatted caption ("[location], [time-of-day]. Made with Vedute
    — vedute.com") copied to clipboard
- New `/v/[id]` route that server-renders OG tags so Twitter / iMessage /
  Slack unfurl beautifully. Reuse `api/og.js`'s structure.
- No direct API integration to Twitter/IG (per scoping decision —
  just download + manual post).

## Done. What's already shipped:

Phase 1: branding rename + localStorage migration + cleanup of /app-classic
+ removal of graphics editor.

Phase 2: design tokens + aspect ratio picker w/ custom + saved views
revamp w/ thumbnails + rename + reorder + default + queue reorder support.

Phase 3.3: distance-aware fly-to with altitude arc.

Phase 4: 8 preset views + first-run welcome card with hints.

Phase 5: resolution presets clean (no UI changes; existing 1×–4× selector
is fine; server upscale deferred since it needs an upscale provider key).

Phase 1.3 — Phase 5 commits live on the `vedute-rebrand` branch.
