import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // plugin-react v6 talks to oxc; vitest's bundled vite 7 still uses esbuild
  // for the dev transform. Tell esbuild to use the automatic JSX runtime so
  // .jsx test files (and component files imported from them) compile.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
})
