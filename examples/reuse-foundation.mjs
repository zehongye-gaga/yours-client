import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Context, FiberState } from 'cordis'
import Loader from '@cordisjs/plugin-loader'
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { createScope, NamedEntries, ScopedLayers } from '@deepseek-ai/dsh-scope'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'

const projectSpec = defineDomain({
  name: 'project_dashboard', version: 1,
  tables: { projects: domainTable(z.object({ openPrs: z.number().int().nonnegative() })) },
})

async function boot(dataDir, backend) {
  const ctx = new Context()
  try {
    await ctx.plugin(Loader, { baseUrl: import.meta.url })
    await ctx.loader.create({
      name: '@cordisjs/plugin-group', group: true,
      config: [
        { id: 'storage', name: '@deepseek-ai/dsh-storage' },
        {
          id: 'backend', name: `@deepseek-ai/dsh-storage-${backend}`,
          config: backend === 'json' ? { root: dataDir } : { path: join(dataDir, 'state.sqlite') },
        },
        { id: 'domain', name: '@deepseek-ai/dsh-storage-domain', config: { backend } },
        { id: 'timer', name: '@cordisjs/plugin-timer' },
        { id: 'processes', name: '@deepseek-ai/dsh-subprocess-local' },
      ],
    })
    await ctx.loader.await()
    for (const entry of ctx.loader.entries()) {
      assert.equal(entry.innerFiber?.state, FiberState.ACTIVE, `Plugin did not activate: ${entry.options.name}`)
    }
    assert.ok(ctx.subprocess instanceof LocalSubprocessRuntime)
    return ctx
  } catch (error) {
    await ctx.fiber.dispose()
    throw error
  }
}

const spawnSpec = code => ({
  argv: [process.execPath, '-e', code], cwd: process.cwd(),
  stdio: { stdin: 'ignore', stdout: { maxBytes: 4096 }, stderr: { maxBytes: 4096 } },
  graceMs: 100,
})

// No model, network, browser, or persistent user files are needed for this smoke.
export async function runReuseFoundation(backend = 'sqlite') {
  assert.ok(['json', 'sqlite'].includes(backend))
  const dataDir = await mkdtemp(join(tmpdir(), 'yours-reuse-'))
  const exitListenersBefore = process.listenerCount('exit')
  let ctx
  try {
    ctx = await boot(dataDir, backend)
    const domain = await ctx.storageDomain.open(projectSpec)
    const store = createSnapshotStore({ openPrs: 0 })
    const core = new SlotCore()
    const changes = []
    const key = { workspace: 'demo' }
    const sibling = { workspace: 'other' }
    const layers = new ScopedLayers(
      () => new NamedEntries(name => new Error(`Duplicate contribution: ${name}`)),
      () => {},
    )
    const consumer = await ctx.plugin({
      name: 'example-workbench', inject: ['storageDomain', 'subprocess', 'timer'],
      apply(app) {
        app.effect(() => () => domain.close())
        app.on('domain/changed', () => {
          const saved = domain.table('projects').get('demo/repository')
          if (saved) store.update(draft => { draft.openPrs = saved.openPrs })
        })
        app.effect(() => store.subscribe(() => { changes.push(store.getSnapshot().openPrs) }))
        app.effect(() => core.register({
          name: 'root', children: { 'workspace.right': { kind: 'list', scope: 'root' } },
        }, () => null))
        const scope = createScope(app, key)
        scope.ctx.effect(() => core.register({ name: 'workspace.right', id: 'project-dashboard' }, () => null))
        layers.effect(scope.ctx, layer => layer.insert('project.read', 'demo-only'), { label: 'example tool contribution' })
        // The timer is owned by this consumer fiber, so unloading it must clear the timer.
        app.setInterval(() => {}, 60_000)
      },
    })
    assert.equal(consumer.state, FiberState.ACTIVE)
    assert.equal(core.entriesOfSlot('workspace.right').length, 1)
    assert.equal(layers.merge(key, layer => layer).get('project.read'), 'demo-only')
    assert.equal(layers.merge(sibling, layer => layer).size, 0)

    const task = ctx.subprocess.spawn(spawnSpec('process.stdout.write(JSON.stringify({ openPrs: 3 }))'))
    const result = await task.done
    await task.waitForExit()
    assert.equal(result.exitCode, 0)
    const payload = JSON.parse(task.collected.stdout.readFrom(0).text)
    await domain.table('projects').put('demo/repository', payload)
    assert.deepEqual(changes, [3])

    await consumer.dispose()
    assert.equal(core.entriesOfSlot('workspace.right').length, 0)
    assert.equal(layers.merge(key, layer => layer).size, 0)

    // Exercise provider shutdown with a live process, not just a completed command.
    const live = ctx.subprocess.spawn(spawnSpec('setInterval(() => {}, 1000); process.stdout.write("ready")'))
    for (let attempts = 0; !live.collected.stdout.readFrom(0).text.includes('ready'); attempts++) {
      assert.ok(attempts < 300, 'Managed child did not become ready')
      await delay(10)
    }
    await ctx.fiber.dispose()
    await live.waitForExit()
    ctx = undefined

    ctx = await boot(dataDir, backend)
    const restored = await ctx.storageDomain.open(projectSpec)
    assert.deepEqual(restored.table('projects').get('demo/repository'), { openPrs: 3 })
    await ctx.fiber.dispose()
    ctx = undefined
    assert.equal(process.listenerCount('exit'), exitListenersBefore)
    return { backend, openPrs: 3, restored: true, scoped: true, uiRemoved: true, processStopped: true }
  } finally {
    try { await ctx?.fiber.dispose() } finally { await rm(dataDir, { recursive: true, force: true }) }
  }
}

if (import.meta.main) {
  for (const backend of ['json', 'sqlite']) console.log(JSON.stringify(await runReuseFoundation(backend)))
}
