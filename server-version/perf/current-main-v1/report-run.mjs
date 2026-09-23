import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const finiteNonnegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
const integerNonnegative = (value) => Number.isSafeInteger(value) && value >= 0

function metricCount(metrics, name, { required = false } = {}) {
  const item = metrics?.[name]
  if (!item) {
    if (required) throw new Error(`missing required k6 metric ${name}`)
    return 0
  }
  if (!integerNonnegative(item.count)) throw new Error(`invalid count for ${name}`)
  return item.count
}

function prometheusSamples(raw, name) {
  const samples = new Map()
  for (const line of String(raw || '').split('\n')) {
    if (!line.startsWith(name)) continue
    const match = line.match(/^([^\s{]+)(\{[^}]*\})?\s+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/i)
    if (match && match[1] === name) samples.set(match[2] || '', Number(match[3]))
  }
  return samples
}

export function metricDelta(before, after, name, { required = false } = {}) {
  const first = prometheusSamples(before, name)
  const second = prometheusSamples(after, name)
  if (required && (!first.size || !second.size)) throw new Error(`missing required process metric ${name}`)
  const out = []
  for (const [labels, value] of second) {
    const previous = first.get(labels) || 0
    if (!finiteNonnegative(value) || !finiteNonnegative(previous) || value < previous) {
      throw new Error(`non-monotonic process metric ${name}${labels}`)
    }
    if (value - previous > 0) out.push({ labels, delta: value - previous })
  }
  return out
}

function assertDurableProbe(probe, group) {
  if (!probe || probe.group !== group || !integerNonnegative(probe.fixtureCount)
    || !integerNonnegative(probe.completed) || !integerNonnegative(probe.wrongIdentity)
    || probe.completed > probe.fixtureCount) throw new Error(`invalid durable probe for ${group}`)
}

export function analyzeRun({ manifest, k6, before, afterWindow, afterDrain, metricsBefore, metricsAfter }) {
  const errors = []
  const reject = (message) => errors.push(message)
  let counts = null
  let cost = null
  try {
    if (!manifest || typeof manifest.group !== 'string' || !Number.isInteger(manifest.offered)
      || manifest.offered < 1 || !finiteNonnegative(manifest.steadySeconds)
      || manifest.steadySeconds === 0 || !manifest.fixtureChecksum) throw new Error('invalid run manifest')
    assertDurableProbe(before, manifest.group)
    assertDurableProbe(afterWindow, manifest.group)
    assertDurableProbe(afterDrain, manifest.group)
    if (before.fixtureCount !== afterWindow.fixtureCount || before.fixtureCount !== afterDrain.fixtureCount) {
      throw new Error('durable probe fixture counts changed')
    }
    const metrics = k6?.metrics
    const started = metricCount(metrics, 'iterations', { required: true })
    const dropped = metricCount(metrics, 'dropped_iterations')
    const fixtureUsed = metricCount(metrics, 'gate_e_fixtures_used', { required: true })
    const fresh = metricCount(metrics, 'gate_e_fresh_completions')
    const replay = metricCount(metrics, 'gate_e_idempotent_replays')
    const recovered = metricCount(metrics, 'gate_e_retry_recovered_replays')
    const firstAttemptReplay = metricCount(metrics, 'gate_e_first_attempt_replays')
    const retry = metricCount(metrics, 'gate_e_capacity_retries')
    const eventualSuccess = metricCount(metrics, 'gate_e_eventual_success')
    const eventualFailure = metricCount(metrics, 'gate_e_eventual_failure')
    const missingFixture = metricCount(metrics, 'gate_e_missing_fixtures')
    const http2xx = metricCount(metrics, 'gate_e_http_2xx')
    const http4xx = metricCount(metrics, 'gate_e_http_4xx')
    const http5xx = metricCount(metrics, 'gate_e_http_5xx')
    const networkErrors = metricCount(metrics, 'gate_e_network_errors')
    const status429 = metricCount(metrics, 'gate_e_rate_limited_429')
    const status503 = metricCount(metrics, 'gate_e_capacity_busy_503')
    const interrupted = Math.max(0, fixtureUsed + missingFixture - started)
    const checks = metrics?.checks
    const duration = metrics?.http_req_duration
    if (!checks || !integerNonnegative(checks.passes) || !integerNonnegative(checks.fails)
      || checks.passes + checks.fails === 0) throw new Error('missing or empty checks metric')
    if (!duration || !finiteNonnegative(duration['p(95)']) || !finiteNonnegative(duration.med)) {
      throw new Error('missing or empty HTTP latency metric')
    }
    if (!started || !fixtureUsed) reject('empty started or fixture sample')
    if (started > fixtureUsed + missingFixture || started !== eventualSuccess + eventualFailure) reject('client logical accounting differs from completed iterations')
    if (manifest.offered !== started + interrupted + dropped) reject('offered does not reconcile with completed, interrupted and dropped iterations')
    if (manifest.configuredArrivals !== undefined && Math.abs(manifest.configuredArrivals - manifest.offered) > 1) {
      reject('observed k6 arrivals exceed configured schedule boundary')
    }
    if (fresh + recovered !== eventualSuccess || recovered + firstAttemptReplay !== replay
      || replay > started + retry || missingFixture > started) reject('invalid fresh/replay/recovery/missing counters')
    if (http2xx + http4xx + http5xx + networkErrors < fixtureUsed - interrupted) reject('HTTP attempt categories do not cover completed fixture requests')
    if (missingFixture > 0) reject('fixture pool exhausted during load')
    if (afterWindow.completed < before.completed || afterDrain.completed < afterWindow.completed) reject('durable completion count decreased')
    const windowCompleted = afterWindow.completed - before.completed
    const drainCompleted = afterDrain.completed - before.completed
    if (drainCompleted !== fresh + recovered) reject('durable completed delta differs from client fresh plus recovered completion count')
    if (before.wrongIdentity || afterWindow.wrongIdentity || afterDrain.wrongIdentity) reject('durable submission identity mismatch')
    if (drainCompleted > manifest.offered) reject('durable completion exceeds offered work')
    counts = {
      offered: manifest.offered, started, interrupted, dropped, fixtureUsed,
      fresh, replay, recovered, firstAttemptReplay, retry, eventualSuccess, eventualFailure, missingFixture,
      http2xx, http4xx, http5xx, networkErrors, status429, status503,
      checksFailed: checks.fails, windowCompleted, drainCompleted,
      windowCompletedPerSecond: windowCompleted / manifest.steadySeconds,
      // Drain is a count only. It is never divided by steady seconds.
      p50Ms: duration.med, p95Ms: duration['p(95)'],
      responseBytes: metricCount(metrics, 'data_received', { required: true }),
    }
    if (counts.responseBytes !== null && !integerNonnegative(counts.responseBytes)) reject('invalid received byte count')
    const sql = metricDelta(metricsBefore, metricsAfter, 'ptool_prisma_sql_events_total', { required: manifest.sqlEventMode === true })
    cost = {
      sqlEvents: sql.length ? sql.reduce((sum, sample) => sum + sample.delta, 0) : manifest.sqlEventMode === true ? 0 : null,
      prismaCalls: metricDelta(metricsBefore, metricsAfter, 'ptool_prisma_call_duration_seconds_count'),
      requestPhases: metricDelta(metricsBefore, metricsAfter, 'ptool_assessment_phase_duration_seconds_count'),
      httpRoutes: metricDelta(metricsBefore, metricsAfter, 'ptool_http_request_duration_seconds_count'),
    }
    if (manifest.requirePrismaCalls !== false && cost.prismaCalls.length === 0) reject('no Prisma model-call samples in request window')
  } catch (error) {
    reject(error instanceof Error ? error.message : String(error))
  }
  const disqualifiers = []
  if (manifest?.qualifiedLoadGenerator !== true) disqualifiers.push('UNQUALIFIED_FOR_CAPACITY: shared or unverified load generator/target')
  if (counts) {
    if (counts.fresh + counts.recovered === 0) disqualifiers.push('NO_FRESH_COMPLETIONS')
    if (counts.firstAttemptReplay > 0) disqualifiers.push('FIRST_ATTEMPT_REPLAYS')
    if (counts.interrupted > 0) disqualifiers.push('INTERRUPTED_ITERATIONS')
    if (counts.dropped > 0) disqualifiers.push('DROPPED_ITERATIONS')
    if (counts.eventualFailure > 0 || counts.checksFailed > 0) disqualifiers.push('HTTP_OR_LOGICAL_FAILURES')
    if (counts.missingFixture > 0) disqualifiers.push('FIXTURE_EXHAUSTION')
  }
  if (errors.length) disqualifiers.push('INVALID_ACCOUNTING')
  return {
    schemaVersion: 1, group: manifest?.group ?? null,
    validationErrors: errors, capacityDisqualifiers: disqualifiers,
    capacityEligible: disqualifiers.length === 0,
    counts, cost,
  }
}

function writeArtifacts(runDir, report) {
  writeFileSync(resolve(runDir, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`)
  const c = report.counts || {}
  const columns = ['group', 'capacityEligible', 'offered', 'started', 'interrupted', 'dropped', 'fresh', 'replay', 'recovered', 'firstAttemptReplay', 'retry', 'windowCompleted', 'drainCompleted', 'windowCompletedPerSecond', 'p50Ms', 'p95Ms']
  const values = columns.map((key) => key === 'group' ? report.group : key === 'capacityEligible' ? report.capacityEligible : c[key])
  writeFileSync(resolve(runDir, 'summary.csv'), `${columns.join(',')}\n${values.map((value) => value ?? '').join(',')}\n`)
  const markdown = [
    `# ${report.group} full-request accounting`, '',
    `Capacity eligible: **${report.capacityEligible ? 'YES' : 'NO'}**`, '',
    `Offered ${c.offered ?? 'unknown'}, completed iterations ${c.started ?? 'unknown'}, interrupted ${c.interrupted ?? 'unknown'}, dropped ${c.dropped ?? 'unknown'}, fresh confirmed ${c.fresh ?? 'unknown'}, retry recovered ${c.recovered ?? 'unknown'}, first-attempt replay ${c.firstAttemptReplay ?? 'unknown'}, retries ${c.retry ?? 'unknown'}.`, '',
    `Durable completed by steady window: ${c.windowCompleted ?? 'unknown'}; after drain: ${c.drainCompleted ?? 'unknown'}. Window completion rate: ${c.windowCompletedPerSecond ?? 'unknown'} per second. Drain completions are not included in this rate.`, '',
    `SQL events: ${report.cost?.sqlEvents ?? 'unavailable'}; p50 ${c.p50Ms ?? 'unknown'} ms; p95 ${c.p95Ms ?? 'unknown'} ms.`, '',
    `Validation errors: ${report.validationErrors.length ? report.validationErrors.join('; ') : 'none'}.`, '',
    `Disqualifiers: ${report.capacityDisqualifiers.length ? report.capacityDisqualifiers.join('; ') : 'none'}.`, '',
  ].join('\n')
  writeFileSync(resolve(runDir, 'summary.md'), markdown)
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const runDir = resolve(process.argv[2] || '')
  const read = (name) => readFileSync(resolve(runDir, name), 'utf8')
  const parse = (name) => JSON.parse(read(name))
  const report = analyzeRun({
    manifest: parse('manifest.json'), k6: parse('k6-summary.json'),
    before: parse('durable-before.json'), afterWindow: parse('durable-window.json'),
    afterDrain: parse('durable-drain.json'),
    metricsBefore: read('metrics-before.txt'), metricsAfter: read('metrics-after.txt'),
  })
  writeArtifacts(runDir, report)
  console.log(JSON.stringify({ group: report.group, capacityEligible: report.capacityEligible, validationErrors: report.validationErrors, capacityDisqualifiers: report.capacityDisqualifiers }))
  if (report.validationErrors.length) process.exitCode = 1
}
