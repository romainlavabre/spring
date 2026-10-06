// Builds the CLI as one self-contained CommonJS file (out/cli/spring.cjs), run
// with `node spring.cjs` (e.g. the MCP server without the app), or by the app binary.
import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const { version } = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }

export default defineConfig({
  logLevel: 'warn',
  define: { SPRING_VERSION: JSON.stringify(version) },
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared'), '@core': resolve(__dirname, 'src/core') } },
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: resolve(__dirname, 'src/cli/main.ts'),
    outDir: 'out/cli',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    rollupOptions: {
      external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`), 'electron'],
      output: { format: 'cjs', entryFileNames: 'spring.cjs', banner: '#!/usr/bin/env node', inlineDynamicImports: true },
      onwarn(warning, warn) {
        if (warning.code !== 'INVALID_ANNOTATION' && warning.code !== 'EVAL') warn(warning)
      }
    }
  }
})
