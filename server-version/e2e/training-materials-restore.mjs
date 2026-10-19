#!/usr/bin/env node
/* Restore the already HTTP-populated C20 database once, within the products job.
 * Only private scratch holds the dump, credentials and schema/row observations. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
const require = createRequire(import.meta.url)
const { guard, fixture, materialTables, databaseSnapshot, applyRuntimeRole, sha, backend, inputDigests, sourceIdentity } = require('./training-materials-fixture.cjs')
const root = guard(), f = fixture(), out = process.env.TRAINING_MATERIALS_EVIDENCE
const sourceUrl = process.env.DATABASE_URL
assert.notEqual(new URL(sourceUrl).username, f.role, 'owner is used only for the complete isolated dump/restore')
const suffix = randomBytes(8).toString('hex'), target = 'c20-restore-' + suffix
const label = `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}-${suffix}`
const password = randomBytes(24).toString('hex')
const dump = path.join(root, 'c20-populated.dump')
const receipt = { status: 'RUNNING', sourceIdentity: sourceIdentity(), fixtureSha256: sha(fs.readFileSync(path.join(backend, '../e2e/training-materials-fixture.cjs'))), source: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID,
  attempt: process.env.GITHUB_RUN_ATTEMPT, inputDigests: inputDigests(), scriptSha256: sha(fs.readFileSync(new URL(import.meta.url))), checks: [] }
let targetId, stage = 'source snapshot'
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024, ...options })
  // Child errors may contain a DSN or row payload. Do not publish them.
  if (result.error || result.status !== 0) throw new Error('Isolated restore subprocess failed at ' + stage)
  return result.stdout
}
const docker = args => run('docker', args).trim()
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const check = name => { receipt.checks.push(name); console.log('PASS:', name) }
function targetIdentity() {
  const value = JSON.parse(docker(['inspect', target]))[0]
  if (targetId) assert.equal(value.Id, targetId)
  assert.equal(value.Config.Labels['eduk12.c20.restore'], label)
  assert.equal(value.Config.Image, 'postgres:16.15-bookworm')
  return value
}
async function main() {
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'browser.json'))).status, 'PASSED')
  // Workflow stops the sole API process group before entering this script.
  try { await fetch('http://127.0.0.1:3000/ready', { signal: AbortSignal.timeout(1500) }); throw new Error('API must be stopped before dump') }
  catch (error) { if (error.message === 'API must be stopped before dump') throw error }
  const before = await databaseSnapshot(sourceUrl)
  receipt.materialTables = Object.fromEntries(materialTables.map(table => [table, before.rows[table]]))
  receipt.publicTableCount = Object.keys(before.rows).length
  receipt.sourceProjectionSha256 = sha(JSON.stringify(before))
  stage = 'source dump'
  const fd = fs.openSync(dump, 'wx', 0o600)
  try {
    run('docker', ['exec', process.env.CI_POSTGRES_SERVICE_ID, 'pg_dump', '-U', 'ptool', '-d', 'ptool',
      '--format=custom', '--no-owner', '--no-privileges'], { stdio: ['ignore', fd, 'pipe'] })
  } finally { fs.closeSync(fd) }
  assert.ok(fs.statSync(dump).size > 0)
  receipt.dumpSha256 = sha(fs.readFileSync(dump))
  assert.deepEqual(await databaseSnapshot(sourceUrl), before, 'source must remain quiescent around pg_dump')
  check('All four C20 tables are nonempty; all public logical rows and material guards remain stable around dump')
  stage = 'isolated target startup'
  targetId = docker(['run', '-d', '--name', target, '--label', 'eduk12.c20.restore=' + label,
    '-e', 'POSTGRES_USER=ptool', '-e', 'POSTGRES_DB=ptool', '-e', 'POSTGRES_PASSWORD=' + password,
    '-p', '127.0.0.1::5432', 'postgres:16.15-bookworm'])
  assert.match(targetId, /^[a-f0-9]{64}$/)
  const info = targetIdentity()
  const bindings = info.NetworkSettings.Ports['5432/tcp']
  assert.equal(bindings.length, 1); assert.equal(bindings[0].HostIp, '127.0.0.1')
  const port = bindings[0].HostPort; assert.match(port, /^\d+$/)
  let ready = false
  for (let i = 0; i < 60; i++) {
    // -h deliberately checks the final TCP server, never initdb's temporary socket server.
    const result = spawnSync('docker', ['exec', target, 'pg_isready', '-h', '127.0.0.1', '-U', 'ptool', '-d', 'ptool'], { stdio: 'ignore', timeout: 5000 })
    if (result.status === 0) { ready = true; break }
    await pause(500)
  }
  assert.equal(ready, true)
  const targetUrl = `postgresql://ptool:${password}@127.0.0.1:${port}/ptool?schema=public`
  stage = 'actual pg_restore'
  docker(['cp', dump, `${target}:/tmp/c20-populated.dump`])
  docker(['exec', target, 'pg_restore', '--exit-on-error', '--no-owner', '--no-privileges', '-U', 'ptool', '-d', 'ptool', '/tmp/c20-populated.dump'])
  const restored = await databaseSnapshot(targetUrl)
  assert.deepEqual(restored, before)
  check('Distinct PostgreSQL16 restore preserves every public row digest/count and C20 function, trigger, FK and deferred constraint')
  stage = 'restored restricted runtime verification'
  const runtimeUrl = await applyRuntimeRole(targetUrl, f.role, f.password)
  run(process.execPath, ['scripts/runtime-role-contract.mjs', 'verify-current'], { cwd: backend,
    env: { ...process.env, DATABASE_URL: runtimeUrl, DATABASE_URL_RUNTIME: runtimeUrl, RUNTIME_ROLE_REQUIRED: 'true' } })
  assert.deepEqual(await databaseSnapshot(targetUrl), before)
  assert.deepEqual(await databaseSnapshot(sourceUrl), before)
  check('Official current-source runtime ACL reconciliation and verify-current pass after restore without altering rows/guards')
  receipt.restoredProjectionSha256 = sha(JSON.stringify(restored))
  receipt.status = 'PASSED'
}
try { await main() }
catch { receipt.status = 'FAILED'; receipt.failedStage = stage; process.exitCode = 1; console.error('C20 restore failed at ' + stage + '; private data withheld') }
finally {
  try {
    const existing = spawnSync('docker', ['inspect', target], { encoding: 'utf8', timeout: 10000 })
    if (existing.status === 0) {
      targetIdentity()
      docker(['rm', '--force', '--volumes', target])
    }
    assert.equal(docker(['ps', '-aq', '--filter', 'name=^/' + target + '$']), '', 'Owned restore container must be absent')
    receipt.containerCleanup = 'PASSED'
  } catch { receipt.status = 'FAILED'; receipt.containerCleanup = 'FAILED'; process.exitCode = 1 }
  try {
    fs.rmSync(root, { recursive: true, force: true })
    assert.equal(fs.existsSync(root), false)
    receipt.privateCleanup = 'PASSED'
  } catch { receipt.status = 'FAILED'; receipt.privateCleanup = 'FAILED'; process.exitCode = 1 }
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'restore.json'), JSON.stringify(receipt, null, 2))
}
