# Vedute

Aerial city posters, made from 3D maps. Pick a location on Google 3D Tiles, tune time of day, clouds, depth-of-field, camera angle, and map style; render a framed poster.

Named for the 18th-century Italian art genre of detailed urban view paintings (Canaletto, Bellotto, Guardi).

![Editor](docs/editor-screenshot.png)

## Quick start

```bash
nvm use
npm install
npm run dev  # dev server → visit http://localhost:5173/app
```

React routes:
- `/` — Vedute landing page (the React `LandingPage`).
- `/app` — the editor (pill UI). Guests can use it directly, no login required.
- `/community` — public posters feed.
- `/login`, `/signup`, `/forgot-password`, `/reset-password` — auth flow.
- `/profile`, `/gallery` — logged-in only.
- `/app-classic` and `/mock` redirect to `/app` (historical aliases; the sidebar editor was removed in Phase 1.2).

Supabase env vars are optional — without them, auth flows degrade gracefully and the editor still runs as guest. Set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` to wire sign-in.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with SPA-fallback for React Router |
| `npm run build` | Production build via `vite.deploy.config.js` → `dist-deploy/` |
| `npm test` | Vitest in watch mode |
| `npm run test:run` | Vitest single run |
| `npm run smoke` | Build + serve `dist-deploy` + Playwright canary against the real bundle |
| `npm run smoke:headed` | Same as `smoke`, visible browser window |

## Project layout

```
src/                    — React app
  App.jsx                 routes (lazy-loaded for the heavy ones)
  components/             shared chrome (Navbar, ProtectedRoute, ToastHost,
                          AuthLayout/Input/Button)
  contexts/AuthContext    Supabase auth + active-profile bridge
  lib/                    entitlements / errors / geocode / migrations / etc.
  pages/                  top-level routes
    editor/               shared scene/atoms/hooks (the editor's heart)
      scene/                @react-three/fiber scene, Scene.jsx is load-bearing
      atoms/                Jotai state
      modals/ hooks/ styles/
    mock/                 pill editor (/app)
      components/           pill primitives + 5 corner clusters
      modals/ hooks/ styles/
prototypes/             — frozen HTML reference implementations (not deployed
                          since the rebrand cleanup; still served by vite dev)
api/                    — Vercel serverless functions
                          gemini.js + og.js (live), stripe-* / places /
                          upscale (501 stubs with detailed wire-up plans)
scripts/smoke.js        — production-build Playwright canary
docs/superpowers/       — design specs, phase plans, ADRs
CLAUDE.md               — architecture, state pattern, event channels, gotchas
```

**Stack:** React 19 SPA, Jotai atoms, `@react-three/fiber` + three.js, `@takram/three-atmosphere` + `@takram/three-clouds`, `3d-tiles-renderer`, Vite build, Supabase auth, Gemini for AI style transfer, Vercel hosting.

## Deployment

- Vercel auto-deploys on push to `main`.
- Rewrites live in `vercel.json` — every customer-facing path
  (`/`, `/app`, `/community`, `/profile`, `/gallery`, the auth flow)
  maps to the React SPA. The prototype HTML pages are no longer
  surfaced via clean URLs (`robots.txt` blocks them too).
- Required env vars:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `GEMINI_API_KEY` (server-side, for `api/gemini.js`)
- Optional env vars (each gated by a 501 stub today):
  - `STRIPE_SECRET_KEY` + `VITE_STRIPE_PRICE_*` (Phase 6.2 monetization)
  - `GOOGLE_PLACES_API_KEY` (Phase 3.2 location autocomplete)
  - `UPSCALE_API_KEY` (Phase 5.1 server-side render upscaling)

## Contributing

See [CLAUDE.md](./CLAUDE.md) for architecture, state pattern, event contracts, and the gotchas list. Run `npm run smoke` before merging — unit tests miss the classes of bug that only surface in the minified prod bundle.

## License

No license file — all rights reserved.
