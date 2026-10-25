import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { build } from 'esbuild'
import unyaml from '@cordisjs/unyaml/esbuild'
import { projectRoot, vendorPackages } from './vendor-packages.mjs'

const staging = resolve(projectRoot, '.build/vendor')
await rm(staging, { recursive: true, force: true })
execFileSync(process.execPath, [resolve(projectRoot, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.vendor.json'], {
  cwd: projectRoot, stdio: 'inherit',
})

for (const { directory } of vendorPackages) {
  const emitted = resolve(staging, relative('vendor', directory), 'src')
  const output = resolve(projectRoot, directory, 'lib')
  await rm(output, { recursive: true, force: true })
  await mkdir(output, { recursive: true })
  await cp(emitted, output, { recursive: true })
  // Relocate map sources after moving compiler artifacts into package exports.
  for (const entry of await readdir(output, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.map')) continue
    const target = resolve(entry.parentPath, entry.name)
    const old = resolve(emitted, relative(output, target))
    const map = JSON.parse(await readFile(target, 'utf8'))
    map.sources = map.sources.map(source => relative(dirname(target), resolve(dirname(old), source)))
    await writeFile(target, JSON.stringify(map))
  }
}
// HMR imports locale YAML. Inline those assets so plain Node consumers need no loader hook.
await build({
  entryPoints: [resolve(projectRoot, 'vendor/cordis/packages/hmr/src/index.ts')],
  outfile: resolve(projectRoot, 'vendor/cordis/packages/hmr/lib/index.js'),
  bundle: true,
  packages: 'external',
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  tsconfigRaw: {},
  plugins: [unyaml()],
})
console.log(`Built ${vendorPackages.length} local packages (one Cordis core, six companions, nine features, five support libraries).`)
