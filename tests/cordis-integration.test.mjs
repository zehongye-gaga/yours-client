import { describe, expect, it } from 'vitest'
import { Context } from 'cordis'
import { runCordisLifecycle } from '../examples/cordis-lifecycle.mjs'

describe('vendored Cordis package integration', () => {
  it('runs the compiled package through dependency loss and recovery', async () => {
    const events = await runCordisLifecycle(() => {})
    expect(events).toEqual([
      'consumer waiting for demoStorage',
      'consumer activated: v1',
      'consumer cleaned: v1',
      'provider cleaned: v1',
      'provider removed; consumer waiting again',
      'consumer activated: v2',
      'consumer cleaned: v2',
      'provider cleaned: v2',
      'all demo plugins disposed; registry empty',
    ])
  })

  it('isolates an explicit service key between workspace realms', async () => {
    const root = new Context()
    try {
      const first = root.isolate('workspaceData', Symbol('workspace-a'))
      const second = root.isolate('workspaceData', Symbol('workspace-b'))
      await first.plugin(ctx => { ctx.provide('workspaceData', { workspaceId: 'a' }) })
      await second.plugin(ctx => { ctx.provide('workspaceData', { workspaceId: 'b' }) })
      const seen = []
      await first.inject(['workspaceData'], ctx => { seen.push(ctx.workspaceData.workspaceId) })
      await second.inject(['workspaceData'], ctx => { seen.push(ctx.workspaceData.workspaceId) })
      expect(seen).toEqual(['a', 'b'])
      expect(root.workspaceData).toBeUndefined()
    } finally {
      await root.fiber.dispose()
    }
  })
})
