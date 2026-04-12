import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const root = resolve(import.meta.dirname, 'prototypes')

export default {
  plugins: [react()],
  root,
  build: {
    outDir: resolve(import.meta.dirname, 'dist-deploy'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        community: resolve(root, 'community.html'),
        user: resolve(root, 'user.html'),
        'poster-v3-ui': resolve(root, 'poster-v3-ui.html'),
        'poster-v2': resolve(root, 'poster-v2.html'),
        'poster-v2-timemachine': resolve(root, 'poster-v2-timemachine.html'),
      }
    }
  }
}
