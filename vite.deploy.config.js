import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const base = import.meta.dirname
const prototypes = resolve(base, 'prototypes')
const src = resolve(base, 'src')

export default {
  plugins: [react()],
  root: base,
  build: {
    outDir: resolve(base, 'dist-deploy'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Main app (auth + React SPA)
        app: resolve(src, 'index.html'),
        // Prototypes
        index: resolve(prototypes, 'index.html'),
        'poster-v3-ui': resolve(prototypes, 'poster-v3-ui.html'),
        'poster-v2': resolve(prototypes, 'poster-v2.html'),
        'poster-v2-timemachine': resolve(prototypes, 'poster-v2-timemachine.html'),
        // Community & user pages
        community: resolve(prototypes, 'community.html'),
        user: resolve(prototypes, 'user.html'),
      }
    }
  }
}
