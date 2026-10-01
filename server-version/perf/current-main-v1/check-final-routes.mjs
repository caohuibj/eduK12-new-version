// Source-level reminder for newly registered FINAL entrypoints. P3-C01 adds
// a live-router reachability test; this checker deliberately reads the router
// declarations and app mounts independently of the maintained CSV.
import { readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const backendSrc = join(repo, 'server-version/backend/src')
const index = readFileSync(join(backendSrc, 'index.ts'), 'utf8')
const inventoryPath = join(repo, 'docs/performance-optimization-v1/route-inventory.csv')
const rows = readFileSync(inventoryPath, 'utf8').trim().split(/\r?\n/)
const columns = rows.shift().split(',')
const routeColumn = columns.indexOf('route_template')
const sourceColumn = columns.indexOf('route_source')
if (routeColumn < 0 || sourceColumn < 0) throw new Error('route inventory columns missing')

const expected = new Map()
for (const row of rows) {
  const fields = row.split(',')
  if (fields.length !== columns.length) throw new Error(`Malformed inventory row: ${row}`)
  const route = fields[routeColumn]
  if (expected.has(route)) throw new Error(`Duplicate inventory route: ${route}`)
  expected.set(route, fields[sourceColumn])
}

const imports = [...index.matchAll(/import\s+(\w+)\s+from\s+['"](\.\/[^'"]+)['"]/g)]
const mounts = [...index.matchAll(/app\.use\(\s*['"](\/api[^'"]*)['"]\s*,([^\n]+)\)/g)]
const actual = new Map()
for (const [, variable, modulePath] of imports) {
  const source = resolve(backendSrc, `${modulePath}.ts`)
  let code
  try { code = readFileSync(source, 'utf8') } catch { continue }
  const submitRoutes = [...code.matchAll(/router\.post\(\s*['"]([^'"]*\/submit)['"]/g)]
  if (submitRoutes.length === 0) continue
  // Assignment and check-in submission are outside FINAL_ONLY assessment.
  if (modulePath === './routes/assignments' || modulePath === './routes/checkins') continue
  const mount = mounts.find(([, , args]) => new RegExp(`\\b${variable}\\b`).test(args))
  if (!mount) throw new Error(`Submit router has no app mount: ${modulePath}`)
  const sourcePath = relative(repo, source).replaceAll('\\', '/')
  for (const [, path] of submitRoutes) {
    const route = `${mount[1]}${path}`
    if (actual.has(route)) throw new Error(`Duplicate registered route: ${route}`)
    actual.set(route, sourcePath)
  }
}

const missing = [...actual].filter(([route, source]) => expected.get(route) !== source)
const stale = [...expected].filter(([route, source]) => actual.get(route) !== source)
if (missing.length || stale.length) {
  throw new Error(`FINAL route inventory mismatch\nNew or remapped: ${JSON.stringify(missing)}\nStale: ${JSON.stringify(stale)}`)
}
if (expected.size !== 15) throw new Error(`Expected 15 reviewed FINAL routes, found ${expected.size}`)
process.stdout.write(`FINAL route inventory: ${actual.size} registered templates matched\n`)
