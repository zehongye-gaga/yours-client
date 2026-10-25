import { defineConfig } from 'vitest/config'
import unyaml from '@cordisjs/unyaml/vite'
import { sourceAliases } from './scripts/vendor-packages.mjs'

export default defineConfig({
  plugins: [unyaml()],
  resolve: { alias: sourceAliases },
  test: {
    pool: 'forks',
    maxWorkers: 4,
    execArgv: ['--expose-internals', '--import', 'tsx', '--import', '@cordisjs/unyaml'],
    include: [
      'vendor/cordis/packages/*/tests/**/*.spec.ts',
      'vendor/deepseek-harness/packages/*/*/tests/**/*.spec.{ts,tsx}',
      'vendor/deepseek-harness/packages/subprocess/subprocess-local/tests/spawn-runner-built.e2e.ts',
      'tests/**/*.test.mjs',
    ],
  },
})
