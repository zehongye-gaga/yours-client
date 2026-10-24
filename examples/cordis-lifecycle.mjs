import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { Context } from 'cordis'

// Real Cordis APIs; no model, Electron, network, or custom kernel needed.
export async function runCordisLifecycle(log = console.log) {
  const root = new Context()
  const events = []
  const record = message => { events.push(message); log(message) }
  let activations = 0
  try {
    const consumer = root.inject(['demoStorage'], ctx => {
      activations++
      record(`consumer activated: ${ctx.demoStorage.version}`)
      return () => record(`consumer cleaned: ${ctx.demoStorage.version}`)
    })
    await consumer.await()
    assert.equal(activations, 0)
    record('consumer waiting for demoStorage')

    const provider = version => root.plugin({
      name: 'demo-storage',
      apply(ctx) {
        ctx.provide('demoStorage', { version })
        return () => record(`provider cleaned: ${version}`)
      },
    })

    const first = await provider('v1')
    await consumer.await()
    assert.equal(activations, 1)
    await first.dispose()
    await consumer.await()
    assert.deepEqual(events.slice(-2), ['consumer cleaned: v1', 'provider cleaned: v1'])
    assert.equal(root.demoStorage, undefined)
    record('provider removed; consumer waiting again')

    const second = await provider('v2')
    await consumer.await()
    assert.equal(activations, 2)
    await consumer.dispose()
    await second.dispose()
    assert.equal(root.registry.size, 0)
    record('all demo plugins disposed; registry empty')
    return events
  } finally {
    await root.fiber.dispose()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCordisLifecycle()
}
