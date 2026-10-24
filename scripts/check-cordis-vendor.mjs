import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const root = new URL('../vendor/cordis/', import.meta.url)
const upstream = JSON.parse(await readFile(new URL('UPSTREAM.json', root), 'utf8'))
const errors = []
const expectedFiles = { ...upstream.files }
for (const change of upstream.sourceModifications) {
  if (!change.reason || !change.path || change.path.startsWith('/') || change.path.split('/').includes('..')) throw new Error('Invalid local change record')
  expectedFiles[change.path] = { sha256: change.sha256 }
}
for (const [path, expected] of Object.entries(expectedFiles)) {
  try {
    const contents = await readFile(new URL(path, root))
    const actual = createHash('sha256').update(contents).digest('hex')
    if (actual !== expected.sha256) errors.push(`${path}: differs from tracked baseline; record the local change in UPSTREAM.json`)
  } catch (error) {
    if (error.code === 'ENOENT' && expected.sha256 === null) continue
    errors.push(`${path}: ${error.code || error.message}`)
  }
}
for (const directory of ['packages/core/src', 'packages/core/tests']) {
  for (const entry of await readdir(new URL(directory + '/', root), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const path = relative(fileURLToPath(root), join(entry.parentPath, entry.name)).split('\\').join('/')
    if (!Object.hasOwn(expectedFiles, path)) errors.push(`${path}: untracked local source or test`)
  }
}
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(`Cordis ${upstream.commit.slice(0, 8)}: ${Object.keys(upstream.files).length} imported files verified; ${upstream.sourceModifications.length} tracked local changes; MIT license retained.`)
}
