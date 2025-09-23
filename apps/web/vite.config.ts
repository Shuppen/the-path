import { fileURLToPath } from 'node:url'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'vite'
import type { UserConfig as VitestUserConfig } from 'vitest/config'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

const config: UserConfig & { test: VitestUserConfig['test'] } = {
  plugins: [react()],
  resolve: {
    alias: {
      '@the-path/types': path.resolve(projectRoot, '../../packages/types/src'),
      '@the-path/utils': path.resolve(projectRoot, '../../packages/utils/src'),
    },
  },
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
}

export default defineConfig(config)
