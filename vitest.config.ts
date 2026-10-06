import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@core': resolve(__dirname, 'src/core'),
  '@': resolve(__dirname, 'src/renderer/src')
}

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        // Component tests (.tsx) pick jsdom with a `@vitest-environment` comment.
        test: { name: 'unit', include: ['tests/unit/**/*.test.{ts,tsx}'], environment: 'node' }
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60_000,
          hookTimeout: 120_000,
          fileParallelism: false
        }
      }
    ]
  }
})
