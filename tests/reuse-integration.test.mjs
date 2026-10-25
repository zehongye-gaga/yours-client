import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('installed reuse packages', () => {
  it('composes built exports through Loader, persists across restart, and unloads UI and processes', async () => {
    // Deliberately run plain Node: no Vitest aliases, tsx hooks, or source imports.
    const { stdout } = await promisify(execFile)(process.execPath, [
      fileURLToPath(new URL('../examples/reuse-foundation.mjs', import.meta.url)),
    ], { timeout: 20_000 })
    const results = stdout.trim().split('\n').map(line => JSON.parse(line))
    expect(results).toEqual(['json', 'sqlite'].map(backend => ({
      backend, openPrs: 3, restored: true, scoped: true, uiRemoved: true, processStopped: true,
    })))
  }, 25_000)
})
