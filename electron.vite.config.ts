import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve('src/shared'), '@core': resolve('src/core') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared }
  },
  renderer: {
    // Shiki and Mermaid ship one chunk per language or diagram: listing them all drowns real warnings.
    logLevel: 'warn',
    plugins: [react(), tailwindcss()],
    build: {
      chunkSizeWarningLimit: 4000,
      rollupOptions: {
        // zod places tree-shaking hints where Rollup cannot read them: harmless.
        onwarn(warning, warn) {
          if (warning.code !== 'INVALID_ANNOTATION') warn(warning)
        }
      }
    },
    resolve: {
      alias: { ...shared, '@': resolve('src/renderer/src') }
    }
  }
})
