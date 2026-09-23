import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs'
import { resolve } from 'node:path'
import os from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { metricDelta } from './report-run.mjs'

const root = resolve(import.meta.dirname, '../../..')
const backend = resolve(import.meta.dirname, '../../backend')
const fixtureFile = process.env.PERF_FIXTURE_FILE
const group = process.env.PERF_FIXTURE_GROUP
const target = new URL(process.env.BASE_URL || '')
if (!fixtureFile || !group || !target.hostname || target.username || target.password || target.search || target.hash) {
  throw new Error('credential-free BASE_URL, PERF_FIXTURE_FILE and PERF_FIXTURE_GROUP are required')
}
if (process.env.PERF_ISOLATED_TEST_MODE !== '1') throw new Error('journey runner requires isolated test mode')
const dbUrl = new URL(process.env.DATABASE_URL || '')
if (!process.env.PERF_FIXTURE_DB_NAME || decodeURIComponent(dbUrl.pathname.slice(1)) !== process.env.PERF_FIXTURE_DB_NAME) {
  throw new Error('PERF_FIXTURE_DB_NAME must match the isolated DATABASE_URL')
}
const groups = JSON.parse(readFileSync(fixtureFile, 'utf8'))
const fixtures = groups[group]
if (!Array.isArray(fixtures) || !fixtures.length || new Set(fixtures.map((fixture) => fixture.fixtureId)).size !== fixtures.length) {
  throw new Error('journey group is empty or has duplicate fixture IDs')
}
const kind = fixtures[0].fixtureClass
if (!['sjtStart', 'sjtResume', 'media'].includes(kind) || fixtures.some((fixture) => fixture.fixtureClass !== kind)) {
  throw new Error('journey group must contain one supported class')
}
const rate = Number(process.env.PERF_RATE || 1)
const steadySeconds = Number(process.env.PERF_SECONDS || 5)
const rateCeiling = Number(process.env.PERF_RATE_CEILING || 100)
if (![rate, steadySeconds, rateCeiling].every((value) => Number.isSafeInteger(value) && value > 0)
  || rate > rateCeiling || steadySeconds > 3600 || fixtures.length < rate * steadySeconds + 1) {
  throw new Error('invalid bounded journey rate/duration or insufficient scheduler-headroom fixtures')
}
const runDir = resolve(process.env.PERF_RUN_DIR || `/tmp/huisurvey-perf01-journey-${Date.now()}`)
if (!runDir.startsWith('/tmp/')) throw new Error('journey output must stay under /tmp')
mkdirSync(runDir, { recursive: true, mode: 0o700 })
const tsx = resolve(backend, 'node_modules/.bin/tsx')
function probe(name) {
  const output = execFileSync(tsx, [resolve(backend, 'scripts/probe-journey-current-main.ts')], {
    cwd: backend, env: process.env, encoding: 'utf8', maxBuffer: 10_000_000,
  }).trim()
  const parsed = JSON.parse(output)
  writeFileSync(resolve(runDir, `journey-${name}.json`), `${JSON.stringify(parsed, null, 2)}\n`)
  return parsed
}
async function metrics(name) {
  let error
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(new URL('/metrics', target), { headers: { Connection: 'close' } })
      if (!response.ok) throw new Error(`/metrics HTTP ${response.status}`)
      const body = await response.text()
      writeFileSync(resolve(runDir, `metrics-${name}.txt`), body)
      return { body, retries: attempt - 1 }
    } catch (caught) {
      error = caught
      if (attempt < 3) await delay(attempt * 250)
    }
  }
  throw error
}
const ready = await fetch(new URL('/ready', target))
if (!ready.ok) throw new Error(`target /ready HTTP ${ready.status}`)
const before = probe('before')
if (kind === 'sjtStart' && before.startedAttempts !== 0) throw new Error('start fixture already has durable attempt')
if (kind === 'sjtResume' && before.resumedRowsFound !== fixtures.length) throw new Error('resume fixture row is missing')
if (kind === 'media' && (before.mediaAttemptsFound !== fixtures.length || before.mediaAssetsFound !== new Set(fixtures.map((fixture) => fixture.assetId)).size || before.mediaHashMismatch)) {
  throw new Error('media fixture attempt or asset is missing or has wrong hash')
}
const metricsBefore = await metrics('before')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const manifest = {
  schemaVersion: 1, planId: 'PERF-01', group, kind,
  baseSha: git('merge-base', 'HEAD', 'origin/main'), mainObservedSha: git('rev-parse', 'origin/main'),
  headSha: git('rev-parse', 'HEAD'), targetImageDigest: process.env.PERF_TARGET_IMAGE_DIGEST || null,
  targetBaseUrl: target.origin,
  loadGenerator: { platform: os.platform(), architecture: os.arch(), cpuLogicalCount: os.cpus().length, memoryBytes: os.totalmem(), cgroup: 'unavailable-on-this-host' },
  qualifiedLoadGenerator: false,
  fixtureChecksum: createHash('sha256').update(readFileSync(fixtureFile)).digest('hex'),
  fixtureCount: fixtures.length, configuredArrivals: rate * steadySeconds,
  rate, steadySeconds, metricScrapeRetries: { before: metricsBefore.retries, after: null },
  startedAt: new Date().toISOString(),
}
writeFileSync(resolve(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
const logFile = openSync(resolve(runDir, 'k6-console.log'), 'w', 0o600)
const run = spawnSync('k6', ['run', '--summary-export', resolve(runDir, 'k6-summary.json'), resolve(import.meta.dirname, 'k6-journey.js')], {
  cwd: root, env: {
    ...process.env, FIXTURE_FILE: resolve(fixtureFile), GROUP: group, BASE_URL: target.origin,
    RATE: String(rate), DURATION: `${steadySeconds}s`,
    PRE_VUS: String(process.env.PERF_PRE_VUS || 4), MAX_VUS: String(process.env.PERF_MAX_VUS || 16),
  }, stdio: ['ignore', logFile, logFile],
})
closeSync(logFile)
manifest.endedAt = new Date().toISOString()
manifest.k6ExitCode = run.status
const after = probe('after')
const metricsAfter = await metrics('after')
manifest.metricScrapeRetries.after = metricsAfter.retries
const k6 = JSON.parse(readFileSync(resolve(runDir, 'k6-summary.json'), 'utf8'))
const count = (name, required = false) => {
  const metric = k6.metrics?.[name]
  if (!metric && required) throw new Error(`missing k6 metric ${name}`)
  const value = metric?.count || 0
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`invalid k6 count ${name}`)
  return value
}
const completedIterations = count('iterations', true)
const used = count('journey_fixture_used', true)
const missing = count('journey_missing_fixture')
const success = count('journey_success', true)
const failure = count('journey_failure')
const dropped = count('dropped_iterations')
const interrupted = Math.max(0, used + missing - completedIterations)
const offered = completedIterations + interrupted + dropped
manifest.offered = offered
writeFileSync(resolve(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
const errors = []
if (Math.abs(offered - manifest.configuredArrivals) > 1) errors.push('observed arrivals exceed scheduler boundary')
if (completedIterations !== success + failure || completedIterations > used + missing) errors.push('journey logical accounting mismatch')
if (!completedIterations || !k6.metrics?.http_req_duration || !k6.metrics?.data_received) errors.push('missing or empty HTTP samples')
if (missing) errors.push('journey fixtures exhausted')
if (kind === 'sjtStart' && after.startedAttempts - before.startedAttempts !== success) errors.push('start durable delta differs from success count')
if (kind === 'sjtResume' && after.resumedRowsFound !== before.resumedRowsFound) errors.push('resume durable fixture rows changed')
if (kind === 'media' && (after.mediaAttemptsFound !== before.mediaAttemptsFound || after.mediaAssetsFound !== before.mediaAssetsFound || after.mediaHashMismatch)) {
  errors.push('media fixture attempt or asset changed')
}
const report = {
  schemaVersion: 1, group, kind, validationErrors: errors,
  capacityDisqualifiers: ['UNQUALIFIED_FOR_CAPACITY: shared or unverified host', ...(interrupted ? ['INTERRUPTED_ITERATIONS'] : []), ...(dropped ? ['DROPPED_ITERATIONS'] : []), ...(failure ? ['HTTP_FAILURES'] : [])],
  capacityEligible: false,
  counts: {
    offered, completedIterations, interrupted, dropped, used, success, failure, missing,
    http2xx: count('journey_http_2xx'), http4xx: count('journey_http_4xx'), http5xx: count('journey_http_5xx'),
    networkErrors: count('journey_network_error'),
    durableBefore: kind === 'sjtStart' ? before.startedAttempts : kind === 'sjtResume' ? before.resumedRowsFound : before.mediaAttemptsFound,
    durableAfter: kind === 'sjtStart' ? after.startedAttempts : kind === 'sjtResume' ? after.resumedRowsFound : after.mediaAttemptsFound,
    p50Ms: k6.metrics?.http_req_duration?.med ?? null,
    p95Ms: k6.metrics?.http_req_duration?.['p(95)'] ?? null,
    responseBytes: count('data_received', true),
  },
  cost: {
    prismaCalls: metricDelta(metricsBefore.body, metricsAfter.body, 'ptool_prisma_call_duration_seconds_count'),
    requestPhases: metricDelta(metricsBefore.body, metricsAfter.body, 'ptool_assessment_phase_duration_seconds_count'),
    httpRoutes: metricDelta(metricsBefore.body, metricsAfter.body, 'ptool_http_request_duration_seconds_count'),
  },
}
writeFileSync(resolve(runDir, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`)
writeFileSync(resolve(runDir, 'summary.csv'), `group,kind,offered,completedIterations,interrupted,dropped,success,failure,durableBefore,durableAfter,p50Ms,p95Ms,responseBytes\n${[group, kind, offered, completedIterations, interrupted, dropped, success, failure, report.counts.durableBefore, report.counts.durableAfter, report.counts.p50Ms, report.counts.p95Ms, report.counts.responseBytes].join(',')}\n`)
writeFileSync(resolve(runDir, 'summary.md'), `# ${group} HTTP journey\n\n${kind}: ${success}/${offered} successful, ${interrupted} interrupted, ${dropped} dropped. Durable rows ${report.counts.durableBefore} → ${report.counts.durableAfter}. Capacity unqualified on this host. Validation: ${errors.length ? errors.join('; ') : 'passed'}.\n`)
console.log(JSON.stringify({ runDir, group, success, offered, interrupted, durableAfter: report.counts.durableAfter, validationErrors: errors }))
if (errors.length || run.status !== 0) process.exitCode = 1
