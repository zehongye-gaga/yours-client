import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    pool: 'forks',
    include: [
      'vendor/cordis/packages/core/tests/**/*.spec.ts',
      'tests/**/*.test.mjs',
    ],
  },
})
