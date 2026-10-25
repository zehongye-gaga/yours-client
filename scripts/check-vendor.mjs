import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

for (const name of ['cordis', 'deepseek-harness']) {
  const root = new URL(`../vendor/${name}/`, import.meta.url)
  const upstream = JSON.parse(await readFile(new URL('UPSTREAM.json', root), 'utf8'))
  const expectedFiles = { ...upstream.files }
  const errors = []
  for (const change of upstream.sourceModifications) {
    if (!change.reason || !change.path || change.path.startsWith('/') || change.path.split('/').includes('..')) {
      throw new Error(`Invalid local change record in ${name}`)
    }
    expectedFiles[change.path] = { sha256: change.sha256 }
  }
  for (const [path, expected] of Object.entries(expectedFiles)) {
    try {
      const contents = await readFile(new URL(path, root))
      const actual = createHash('sha256').update(contents).digest('hex')
      if (actual !== expected.sha256) errors.push(`${name}/${path}: differs from the recorded baseline/change`)
    } catch (error) {
      if (error.code === 'ENOENT' && expected.sha256 === null) continue
      errors.push(`${name}/${path}: ${error.code || error.message}`)
    }
  }
  const packages = new Set(Object.keys(upstream.files)
    .filter(path => path.endsWith('/package.json')).map(path => path.slice(0, -'/package.json'.length)))
  for (const directory of packages) {
    for (const area of ['src', 'tests', 'scripts']) {
      const entries = await readdir(new URL(`${directory}/${area}/`, root), { recursive: true, withFileTypes: true })
        .catch(error => { if (error.code === 'ENOENT') return []; throw error })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        const path = relative(fileURLToPath(root), join(entry.parentPath, entry.name)).split('\\').join('/')
        if (!Object.hasOwn(expectedFiles, path)) errors.push(`${name}/${path}: untracked local source, test, or script`)
      }
    }
  }
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  } else {
    console.log(`${name} ${upstream.commit.slice(0, 8)}: ${Object.keys(upstream.files).length} imported files; ${upstream.sourceModifications.length} recorded adaptations; licenses retained.`)
  }
}
