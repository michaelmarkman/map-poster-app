# map-poster-app

3D map poster editor. Pick a location on Google 3D Tiles, tune time of day, clouds, depth-of-field, camera angle, and map style; export a framed poster.

![Editor](docs/editor-screenshot.png)

## Quick start

```bash
nvm use
npm install
npm run dev  # dev server → visit http://localhost:5173/app
```

The landing page at `/` is the static prototype; the React editor lives at `/app` (pill UI — the default). The legacy sidebar editor is preserved at `/app-classic`. First load may look blank if Supabase env vars aren't set — the editor at `/app` runs regardless (auth degrades gracefully).

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
src/pages/editor/       — sidebar editor (/app-classic) + shared scene/atoms/hooks
  scene/                  @react-three/fiber scene, Scene.jsx is load-bearing
  atoms/                  Jotai state
  sidebar/ modals/ hooks/ styles/
src/pages/mock/         — pill editor (/app, the new default UI)
  components/             pill primitives + 5 corner clusters
  modals/ hooks/ styles/
prototypes/             — original HTML prototype, frozen as reference
api/                    — Vercel serverless fns (gemini.js, og.js)
scripts/smoke.js        — production-build canary (covers both /app + /app-classic)
docs/superpowers/       — design specs, phase plans, ADRs
CLAUDE.md               — architecture, state pattern, event channels, gotchas
```

**Stack:** React 19 SPA, Jotai atoms, `@react-three/fiber` + three.js, `@takram/three-atmosphere` + `@takram/three-clouds`, `3d-tiles-renderer`, Vite build, Supabase auth, Gemini for AI style transfer, Vercel hosting.

## Deployment

- Vercel auto-deploys on push to `main`.
- Rewrites live in `vercel.json` (landing → prototype; `/app/*` and `/app-classic/*` → React SPA; legacy `*.html` paths preserved).
- Required env vars:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `GEMINI_API_KEY` (server-side, for `api/gemini.js`)

## Contributing

See [CLAUDE.md](./CLAUDE.md) for architecture, state pattern, event contracts, and the gotchas list. Run `npm run smoke` before merging — unit tests miss the classes of bug that only surface in the minified prod bundle.

## License

No license file — all rights reserved.
