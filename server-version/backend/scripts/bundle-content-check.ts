import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { z } from 'zod'
import { generatePackages } from '../src/modules/assessment-bundle/onboarding/loader'
import { hashDeclarativePackage } from '../src/modules/assessment-bundle/onboarding/contract'
import { verifyPackageFixtures } from '../src/modules/assessment-bundle/onboarding/fixtures'
import { dependencyBlockers } from '../src/modules/assessment-bundle/onboarding/dependencies'

const baseDir = path.resolve(__dirname, '../src/modules/assessment-bundle')
export const smokeSchema = z.object({
  schemaVersion: z.literal(1), synthetic: z.literal(true),
  randomSeed: z.string().regex(/^[a-f0-9]{32}$/).default('0123456789abcdef0123456789abcdef'),
  context: z.record(z.union([z.string(), z.number().finite(), z.boolean(), z.null()])),
  slots: z.record(z.discriminatedUnion('type', [
    z.object({ type: z.literal('SCALE'), answers: z.array(z.object({ itemCode: z.string(), responseValue: z.union([z.string(), z.number(), z.boolean(), z.null()]) }).strict()).min(1) }).strict(),
    z.object({ type: z.literal('SITUATIONAL'), responses: z.array(z.object({ sceneKey: z.string(), channelKey: z.string(), responseValue: z.unknown() }).strict()).min(1) }).strict(),
    z.object({ type: z.literal('COGNITIVE'), trials: z.array(z.unknown()).min(1).max(10000) }).strict(),
  ])),
  expectedKind: z.enum(['COMPUTED', 'UNAVAILABLE']), expectedRuleIds: z.array(z.string()),
}).strict()
export function readSmoke(key: string, version: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(key) || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('BUNDLE_SMOKE_IDENTITY')
  const file = path.join(baseDir, 'ci-fixtures', key, version + '.json')
  // Reject every symlink component, including fixture key directories.
  for (const entry of [path.dirname(path.dirname(file)), path.dirname(file), file]) {
    if (fs.lstatSync(entry).isSymbolicLink()) throw new Error('BUNDLE_SMOKE_SYMLINK')
  }
  if (fs.statSync(file).size > 1024 * 1024) throw new Error('BUNDLE_SMOKE_TOO_LARGE')
  return smokeSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')))
}
export function assertHistory(before: Map<string, string>, after: Map<string, string>) {
  for (const [file, content] of before) {
    if (!after.has(file)) throw new Error('BUNDLE_HISTORY_DELETED:' + file)
    if (after.get(file) !== content) throw new Error('BUNDLE_VERSION_IMMUTABLE:' + file)
  }
}
export function verifyHistory(base: string) {
  if (!/^[a-f0-9]{40}$/.test(base)) throw new Error('BUNDLE_BASE_SHA_REQUIRED')
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const prefix = 'server-version/backend/src/modules/assessment-bundle/'
  const paths = ['packages/', 'ci-fixtures/'].map(p => prefix + p)
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', base, '--', ...paths], { encoding: 'utf8', cwd: root }).split('\0').filter(Boolean)
  const before = new Map<string, string>(), after = new Map<string, string>()
  for (const file of files) {
    before.set(file, execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8', cwd: root }))
    const local = path.join(root, file)
    if (fs.existsSync(local) && fs.lstatSync(local).isFile() && !fs.lstatSync(local).isSymbolicLink()) after.set(file, fs.readFileSync(local, 'utf8'))
  }
  assertHistory(before, after)
}
export function checkContent(base: string) {
  verifyHistory(base)
  const packages = generatePackages(path.join(baseDir, 'packages'), path.join(baseDir, 'generated/packages.json'), true)
  const expectedFiles = new Set<string>()
  const results = packages.map(pack => {
    verifyPackageFixtures(pack)
    const errors = dependencyBlockers(pack)
    if (errors.length) throw new Error(errors.join('; '))
    const d = pack.manifest.definition, smoke = readSmoke(d.bundleKey, d.bundleVersion)
    expectedFiles.add(d.bundleKey + '/' + d.bundleVersion + '.json')
    const slots = d.slots.filter(s => s.unitType !== 'FORM')
    if (Object.keys(smoke.slots).length !== slots.length || slots.some(s => smoke.slots[s.slotKey]?.type !== s.unitType)) throw new Error('BUNDLE_SMOKE_SLOTS:' + d.bundleKey)
    const fields = pack.context?.fields ?? []
    if (Object.keys(smoke.context).some(key => !fields.some(f => f.contextKey === key))) throw new Error('BUNDLE_SMOKE_CONTEXT')
    return { key: d.bundleKey, version: d.bundleVersion, contentHash: hashDeclarativePackage(pack), fixtures: Object.keys(pack.fixtures), smoke: 'required' }
  })
  for (const key of fs.readdirSync(path.join(baseDir, 'ci-fixtures'))) {
    const dir = path.join(baseDir, 'ci-fixtures', key)
    if (fs.lstatSync(dir).isSymbolicLink() || !fs.lstatSync(dir).isDirectory()) throw new Error('BUNDLE_SMOKE_DIRECTORY')
    for (const name of fs.readdirSync(dir)) if (!expectedFiles.has(key + '/' + name)) throw new Error('BUNDLE_SMOKE_ORPHAN:' + key + '/' + name)
  }
  return { ok: true, base, head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dependencyClosure: 'all-bundles', packages: results }
}
if (require.main === module) {
  try {
    // Manual branch runs must still compare historical packages against main,
    // never against their own head (which would hide an old-version overwrite).
    const base = process.env.BUNDLE_CONTENT_BASE_SHA || (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
      ? execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' }).trim() : '')
    const result = checkContent(base)
    const bytes = JSON.stringify(result, null, 2) + '\n'
    if (process.env.BUNDLE_CONTENT_EVIDENCE) fs.writeFileSync(process.env.BUNDLE_CONTENT_EVIDENCE, bytes)
    console.log(bytes)
  } catch (error) {
    if (process.env.BUNDLE_CONTENT_EVIDENCE) fs.writeFileSync(process.env.BUNDLE_CONTENT_EVIDENCE, JSON.stringify({
      ok: false, base: process.env.BUNDLE_CONTENT_BASE_SHA ?? null,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2) + '\n')
    console.error(error); process.exitCode = 1
  }
}
