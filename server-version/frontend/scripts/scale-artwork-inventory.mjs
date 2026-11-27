import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Match the artwork module's Vite imports. Use Git blob identities so the
// deployer can compare an installed image to main without re-reading WebPs.
const root = resolve('src/scale-report-artwork')
const files = {}
const directories = (path) => existsSync(path) ? readdirSync(path, { withFileTypes: true }).filter(entry => entry.isDirectory()) : []
for (const tool of directories(root)) {
  for (const content of directories(join(root, tool.name))) {
    for (const artwork of directories(join(root, tool.name, content.name))) {
      const directory = join(tool.name, content.name, artwork.name)
      for (const file of readdirSync(join(root, directory), { withFileTypes: true })) {
        if (!file.isFile() || !(file.name === 'report-artwork.json' || file.name.endsWith('.webp'))) continue
        const bytes = readFileSync(join(root, directory, file.name))
        files[`${directory}/${file.name}`] = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
      }
    }
  }
}
writeFileSync(process.argv[2], JSON.stringify({ schemaVersion: 1, files }))
