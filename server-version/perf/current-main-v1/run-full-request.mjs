import { spawnSync, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from 'node:fs'
import { resolve } from 'node:path'
import os from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { assertFreshFixturePool } from './fresh-fixture-pool.mjs'

const root = resolve(import.meta.dirname, '../../..')
const backend = resolve(import.meta.dirname, '../../backend')
const fixtureFile = process.env.PERF_FIXTURE_FILE
const group = process.env.PERF_FIXTURE_GROUP
const target = new URL(process.env.BASE_URL || '')
if (!fixtureFile || !group || !target.hostname || target.username || target.password || target.search || target.hash) {
  throw new Error('PERF_FIXTURE_FILE, PERF_FIXTURE_GROUP and a credential-free BASE_URL are required')
}
if (process.env.PERF_ISOLATED_TEST_MODE !== '1' || !process.env.PERF_FIXTURE_DB_NAME) {
  throw new Error('full-request runner requires a named isolated test database')
}
if (['AUTH_TOKEN', 'PERF_AUTH_TOKEN', 'CSRF_TOKEN', 'PERF_CSRF_TOKEN'].some((key) => process.env[key])) {
  throw new Error('global auth tokens would override per-fixture student identities')
}
const rate = Number(process.env.PERF_RATE || 1)
const steadySeconds = Number(process.env.PERF_SECONDS || 5)
const maxRate = Number(process.env.PERF_RATE_CEILING || 100)
const drainSeconds = Number(process.env.PERF_DRAIN_SECONDS || 5)
if (![rate, steadySeconds, maxRate, drainSeconds].every((value) => Number.isSafeInteger(value) && value >= 0)
  || rate < 1 || rate > maxRate || steadySeconds < 1 || steadySeconds > 3600 || drainSeconds > 120) {
  throw new Error('invalid rate, rate ceiling, duration, or drain limit')
}
const groups = JSON.parse(readFileSync(fixtureFile, 'utf8'))
assertFreshFixturePool(groups)
const fixtureCount = groups[group]?.length || 0
const configuredArrivals = rate * steadySeconds
// k6's constant-arrival scheduler can start one extra iteration at the end
// boundary. Reserve that child rather than replaying or hiding the request.
if (fixtureCount < configuredArrivals + 1) {
  throw new Error(`fixture pool exhausted before load: ${group} has ${fixtureCount}, requires ${configuredArrivals + 1} including scheduler boundary headroom`)
}
const runDir = resolve(process.env.PERF_RUN_DIR || `/tmp/huisurvey-perf01-run-${Date.now()}`)
if (!runDir.startsWith('/tmp/')) throw new Error('run artifacts must stay under /tmp')
mkdirSync(runDir, { recursive: true, mode: 0o700 })

const probeEnv = {
  ...process.env, PERF_FIXTURE_GROUP: group, PERF_FIXTURE_FILE: fixtureFile,
}
const probeScript = resolve(backend, 'scripts/probe-durable-current-main.ts')
const tsx = resolve(backend, 'node_modules/.bin/tsx')
function durable(name) {
  const output = execFileSync(tsx, [probeScript], {
    cwd: backend, env: probeEnv, encoding: 'utf8', maxBuffer: 10_000_000,
  }).trim()
  const data = JSON.parse(output)
  writeFileSync(resolve(runDir, `durable-${name}.json`), `${JSON.stringify(data, null, 2)}\n`)
  return data
}
async function metrics(name) {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(new URL('/metrics', target), { headers: { Connection: 'close' } })
      if (!response.ok) throw new Error(`/metrics returned HTTP ${response.status}`)
      const body = await response.text()
      writeFileSync(resolve(runDir, `metrics-${name}.txt`), body)
      return attempt - 1
    } catch (error) {
      lastError = error
      if (attempt < 3) await delay(attempt * 250)
    }
  }
  throw lastError
}

const ready = await fetch(new URL('/ready', target))
if (!ready.ok) throw new Error(`target not ready: HTTP ${ready.status}`)
const databaseShape = JSON.parse(execFileSync(tsx, [resolve(backend, 'scripts/probe-db-shape-current-main.ts')], {
  cwd: backend, env: probeEnv, encoding: 'utf8', maxBuffer: 10_000_000,
}).trim())
writeFileSync(resolve(runDir, 'db-shape-before.json'), `${JSON.stringify(databaseShape, null, 2)}\n`)
const before = durable('before')
if (before.completed !== 0 || before.wrongIdentity !== 0) {
  throw new Error(`fresh run refused: fixture group ${group} already has completed or mismatched rows`)
}
const controlScrapeRetries = await metrics('control')
const beforeScrapeRetries = await metrics('before')

const fixtureChecksum = createHash('sha256').update(readFileSync(fixtureFile)).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const manifest = {
  schemaVersion: 1,
  planId: 'PERF-01', group, phase: 'steady',
  baseSha: git('merge-base', 'HEAD', 'origin/main'),
  mainObservedSha: git('rev-parse', 'origin/main'),
  headSha: git('rev-parse', 'HEAD'),
  targetImageDigest: process.env.PERF_TARGET_IMAGE_DIGEST || null,
  targetBaseUrl: target.origin,
  targetHost: process.env.PERF_TARGET_HOST_MANIFEST || null,
  database: databaseShape,
  loadGenerator: { platform: os.platform(), architecture: os.arch(), cpuLogicalCount: os.cpus().length, memoryBytes: os.totalmem(), cgroup: 'unavailable-on-this-host' },
  qualifiedLoadGenerator: process.env.PERF_CAPACITY_QUALIFIED === '1' && Boolean(process.env.PERF_TARGET_HOST_MANIFEST),
  fixtureChecksum, fixtureCount,
  configuredArrivals, offered: configuredArrivals, rate, steadySeconds, drainSeconds,
  preAllocatedVUs: Number(process.env.PERF_PRE_VUS || 4),
  maxVUs: Number(process.env.PERF_MAX_VUS || 16),
  retryMode: 'finaldraft', retryAttempts: 4,
  sqlEventMode: process.env.PERF_SQL_EVENT_COUNT === '1',
  requireAllFresh: process.env.PERF_REQUIRE_ALL_FRESH === '1',
  scrapeCorrection: true,
  metricScrapeRetries: { control: controlScrapeRetries, before: beforeScrapeRetries, after: null },
  startedAt: new Date().toISOString(),
  rawEvidence: { k6Summary: 'k6-summary.json', k6Console: 'k6-console.log', database: 'db-shape-before.json', durable: ['durable-before.json', 'durable-window.json', 'durable-drain.json'], metrics: ['metrics-control.txt', 'metrics-before.txt', 'metrics-after.txt'] },
}
writeFileSync(resolve(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

const logFile = openSync(resolve(runDir, 'k6-console.log'), 'w', 0o600)
const k6 = spawnSync('k6', ['run', '--summary-export', resolve(runDir, 'k6-summary.json'), resolve(import.meta.dirname, 'k6-full-request.js')], {
  cwd: root, env: {
    ...process.env,
    FIXTURE_FILE: resolve(fixtureFile), GROUP: group, BASE_URL: target.origin,
    RATE: String(rate), DURATION: `${steadySeconds}s`, PHASE: 'steady',
    PRE_VUS: String(manifest.preAllocatedVUs), MAX_VUS: String(manifest.maxVUs),
    RETRY_MODE: 'finaldraft', CAPACITY_RETRY_ATTEMPTS: '4',
  }, stdio: ['ignore', logFile, logFile],
})
closeSync(logFile)
manifest.endedAt = new Date().toISOString()
manifest.k6ExitCode = k6.status
try {
  const k6Summary = JSON.parse(readFileSync(resolve(runDir, 'k6-summary.json'), 'utf8'))
  const started = k6Summary.metrics?.iterations?.count
  const dropped = k6Summary.metrics?.dropped_iterations?.count || 0
  const fixturesUsed = k6Summary.metrics?.gate_e_fixtures_used?.count || 0
  const missingFixtures = k6Summary.metrics?.gate_e_missing_fixtures?.count || 0
  if ([started, dropped, fixturesUsed, missingFixtures].every(Number.isSafeInteger)) {
    manifest.offered = Math.max(started, fixturesUsed + missingFixtures) + dropped
  }
} catch {
  // The strict reporter fails on a missing k6 summary; keep the manifest for diagnosis.
}
writeFileSync(resolve(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
const afterWindow = durable('window')
manifest.metricScrapeRetries.after = await metrics('after')
writeFileSync(resolve(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
await delay(drainSeconds * 1000)
const afterDrain = durable('drain')
const report = spawnSync(process.execPath, [resolve(import.meta.dirname, 'report-run.mjs'), runDir], {
  cwd: root, encoding: 'utf8', maxBuffer: 1_000_000,
})
if (report.stdout) process.stdout.write(report.stdout)
if (report.stderr) process.stderr.write(report.stderr)
console.log(JSON.stringify({ runDir, k6ExitCode: k6.status, durableWindow: afterWindow.completed, durableDrain: afterDrain.completed }))
if (k6.status !== 0 || report.status !== 0) process.exitCode = 1
