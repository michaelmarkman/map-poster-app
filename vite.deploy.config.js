import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const base = import.meta.dirname
const src = resolve(base, 'src')

// Prod build = the React app only. The /prototypes/*.html files were
// kept as build inputs back when /prototypes/index.html was the
// vedute.com landing page (since repointed) and the navbar linked
// Create / Community to /prototypes/poster-v3-ui.html (since
// repointed). Now nothing references them, robots.txt disallows
// /prototypes/, and they only carried the pre-rebrand MapPoster
// brand. Removed them as build inputs so we don't ship the bundle.
//
// Earlier attempt at this hit a code-splitting regression: with one
// input + no override, rolldown bundled everything into a single
// monolith. Since then App.jsx switched to React.lazy() for
// MockEditorPage / Gallery / Community / Profile / DofLab, which
// gives rolldown explicit dynamic import points to split on, so
// chunked output survives even with a single HTML input. (See
// LEARNINGS.md "vite.deploy.config.js prototype inputs are doing
// real work as code-split forcers" for the prior trap.)
export default {
  plugins: [react()],
  root: base,
  publicDir: resolve(base, 'public'),
  build: {
    outDir: resolve(base, 'dist-deploy'),
    emptyOutDir: true,
    // Rolldown's default CSS minifier de-duplicates prefixed properties
    // and was stripping the unprefixed `backdrop-filter:` in favor of the
    // `-webkit-backdrop-filter:` form — which Chrome/Firefox don't read,
    // so the sidebar glass effect disappeared in prod. esbuild keeps
    // both forms.
    cssMinify: 'esbuild',
    rollupOptions: {
      input: {
        // Main app (auth + React SPA) — the only entry point.
        app: resolve(src, 'index.html'),
      },
    },
  },
}
