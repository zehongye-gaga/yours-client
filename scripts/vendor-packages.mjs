import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const harnessRoot = 'vendor/deepseek-harness'
const provenance = JSON.parse(await readFile(resolve(projectRoot, harnessRoot, 'UPSTREAM.json'), 'utf8'))
const directories = [
  ...['core', 'loader', 'include', 'group', 'timer', 'hmr', 'logger-console'].map(name => `vendor/cordis/packages/${name}`),
  ...[...provenance.packages, ...provenance.supportPackages].map(path => `${harnessRoot}/${path}`),
]

export const vendorPackages = await Promise.all(directories.map(async directory => ({
  directory,
  manifest: JSON.parse(await readFile(resolve(projectRoot, directory, 'package.json'), 'utf8')),
})))

// Keep source tests on one module graph. Plain Node smokes exercise installed lib/ exports.
export const sourceAliases = vendorPackages.flatMap(({ directory, manifest }) => {
  const name = manifest.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const root = resolve(projectRoot, directory, 'src')
  const extra = manifest.name === '@deepseek-ai/dsh-subprocess'
    ? [{ find: new RegExp(`^${name}/control$`), replacement: resolve(root, 'control.ts') }]
    : []
  return [
    { find: new RegExp(`^${name}$`), replacement: resolve(root, 'index.ts') },
    { find: new RegExp(`^${name}/src/(.*)$`), replacement: `${root}/$1` },
    ...extra,
  ]
})
