import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeRun } from './report-run.mjs'

const probe = (completed, fixtureCount = 10) => ({ group: 'testSteady', fixtureCount, completed, wrongIdentity: 0 })
const baseline = () => ({
  manifest: { group: 'testSteady', offered: 10, steadySeconds: 10, fixtureChecksum: 'abc', qualifiedLoadGenerator: true, sqlEventMode: true },
  k6: { metrics: {
    iterations: { count: 10 }, gate_e_fixtures_used: { count: 10 },
    gate_e_fresh_completions: { count: 10 }, gate_e_eventual_success: { count: 10 },
    gate_e_http_2xx: { count: 10 },
    checks: { passes: 10, fails: 0 }, http_req_duration: { med: 10, 'p(95)': 20 },
    data_received: { count: 1000 },
  } },
  before: probe(0), afterWindow: probe(10), afterDrain: probe(10),
  metricsBefore: 'ptool_prisma_sql_events_total 0\nptool_prisma_call_duration_seconds_count{model="Test",action="findUnique"} 0\n',
  metricsAfter: 'ptool_prisma_sql_events_total 30\nptool_prisma_call_duration_seconds_count{model="Test",action="findUnique"} 10\n',
})

test('valid fresh durable accounting remains eligible on a qualified host', () => {
  const report = analyzeRun(baseline())
  assert.deepEqual(report.validationErrors, [])
  assert.equal(report.capacityEligible, true)
  assert.equal(report.counts.windowCompletedPerSecond, 1)
  assert.equal(report.cost.sqlEvents, 30)
})

test('all replay cannot be reported as fresh capacity', () => {
  const run = baseline()
  run.k6.metrics.gate_e_fresh_completions.count = 0
  run.k6.metrics.gate_e_eventual_success.count = 0
  run.k6.metrics.gate_e_idempotent_replays = { count: 10 }
  run.k6.metrics.gate_e_first_attempt_replays = { count: 10 }
  run.k6.metrics.gate_e_eventual_failure = { count: 10 }
  run.before = probe(10); run.afterWindow = probe(10); run.afterDrain = probe(10)
  const report = analyzeRun(run)
  assert.equal(report.capacityEligible, false)
  assert.equal(report.counts.fresh, 0)
  assert.ok(report.capacityDisqualifiers.includes('FIRST_ATTEMPT_REPLAYS'))
})

test('only 503 cannot be reported as successful capacity', () => {
  const run = baseline()
  run.k6.metrics.gate_e_fresh_completions.count = 0
  run.k6.metrics.gate_e_eventual_success.count = 0
  run.k6.metrics.gate_e_eventual_failure = { count: 10 }
  run.k6.metrics.gate_e_http_2xx.count = 0
  run.k6.metrics.gate_e_http_5xx = { count: 10 }
  run.k6.metrics.gate_e_capacity_busy_503 = { count: 10 }
  run.before = probe(0); run.afterWindow = probe(0); run.afterDrain = probe(0)
  const report = analyzeRun(run)
  assert.equal(report.capacityEligible, false)
  assert.equal(report.counts.windowCompletedPerSecond, 0)
})

test('dropped iterations cannot inflate served throughput', () => {
  const run = baseline()
  for (const name of ['iterations', 'gate_e_fixtures_used', 'gate_e_fresh_completions', 'gate_e_eventual_success', 'gate_e_http_2xx']) run.k6.metrics[name].count = 7
  run.k6.metrics.dropped_iterations = { count: 3 }
  run.afterWindow = probe(7); run.afterDrain = probe(7)
  const report = analyzeRun(run)
  assert.equal(report.capacityEligible, false)
  assert.equal(report.counts.started, 7)
  assert.equal(report.counts.offered, 10)
  assert.ok(report.capacityDisqualifiers.includes('DROPPED_ITERATIONS'))
})

test('one extra scheduler-boundary fixture does not invalidate completed configured arrivals', () => {
  const run = baseline()
  run.manifest.offered = 11
  run.manifest.configuredArrivals = 10
  run.manifest.requireAllFresh = true
  run.k6.metrics.gate_e_fixtures_used.count = 11
  run.before = probe(0, 11); run.afterWindow = probe(10, 11); run.afterDrain = probe(10, 11)
  const report = analyzeRun(run)
  assert.deepEqual(report.validationErrors, [])
  assert.equal(report.counts.interrupted, 1)
  assert.equal(report.counts.schedulerBoundaryInterrupted, 1)
  assert.equal(report.counts.workloadInterrupted, 0)
  assert.equal(report.capacityEligible, true)
  assert.ok(!report.capacityDisqualifiers.includes('INTERRUPTED_ITERATIONS'))
})

test('one completed scheduler-boundary arrival is explicitly recorded without hiding it', () => {
  const run = baseline()
  run.manifest.offered = 11
  run.manifest.configuredArrivals = 10
  run.manifest.requireAllFresh = true
  for (const name of ['iterations', 'gate_e_fixtures_used', 'gate_e_fresh_completions', 'gate_e_eventual_success', 'gate_e_http_2xx']) {
    run.k6.metrics[name].count = 11
  }
  run.k6.metrics.checks.passes = 11
  run.before = probe(0, 11); run.afterWindow = probe(11, 11); run.afterDrain = probe(11, 11)
  const report = analyzeRun(run)
  assert.deepEqual(report.validationErrors, [])
  assert.equal(report.counts.configuredArrivals, 10)
  assert.equal(report.counts.offered, 11)
  assert.equal(report.counts.started, 11)
  assert.equal(report.counts.schedulerBoundaryInterrupted, 0)
  assert.equal(report.capacityEligible, true)
})

test('an interrupted configured arrival remains disqualified', () => {
  const run = baseline()
  run.manifest.offered = 10
  run.manifest.configuredArrivals = 10
  run.manifest.requireAllFresh = true
  run.k6.metrics.iterations.count = 9
  run.k6.metrics.gate_e_fixtures_used.count = 10
  run.k6.metrics.gate_e_fresh_completions.count = 9
  run.k6.metrics.gate_e_eventual_success.count = 9
  run.k6.metrics.gate_e_http_2xx.count = 9
  run.k6.metrics.checks.passes = 9
  run.before = probe(0); run.afterWindow = probe(9); run.afterDrain = probe(9)
  const report = analyzeRun(run)
  assert.equal(report.counts.interrupted, 1)
  assert.equal(report.counts.schedulerBoundaryInterrupted, 0)
  assert.equal(report.counts.workloadInterrupted, 1)
  assert.equal(report.capacityEligible, false)
  assert.ok(report.capacityDisqualifiers.includes('INTERRUPTED_ITERATIONS'))
  assert.ok(report.validationErrors.some((message) => message.includes('all-fresh baseline')))
})

test('committed write with lost response fails durable/client reconciliation', () => {
  const run = baseline()
  run.manifest.offered = 1
  for (const name of ['iterations', 'gate_e_fixtures_used']) run.k6.metrics[name].count = 1
  run.k6.metrics.gate_e_fresh_completions.count = 0
  run.k6.metrics.gate_e_eventual_success.count = 0
  run.k6.metrics.gate_e_http_2xx.count = 0
  run.k6.metrics.gate_e_network_errors = { count: 1 }
  run.k6.metrics.gate_e_eventual_failure = { count: 1 }
  run.afterWindow = probe(1); run.afterDrain = probe(1)
  const report = analyzeRun(run)
  assert.equal(report.capacityEligible, false)
  assert.ok(report.validationErrors.some((message) => message.includes('durable completed delta differs')))
})

test('a same-identity retry replay reconciles one durable write without inventing an observed fresh response', () => {
  const run = baseline()
  run.manifest.offered = 1
  for (const name of ['iterations', 'gate_e_fixtures_used']) run.k6.metrics[name].count = 1
  run.k6.metrics.gate_e_fresh_completions.count = 0
  run.k6.metrics.gate_e_eventual_success.count = 1
  run.k6.metrics.gate_e_http_2xx.count = 1
  run.k6.metrics.gate_e_network_errors = { count: 1 }
  run.k6.metrics.gate_e_idempotent_replays = { count: 1 }
  run.k6.metrics.gate_e_retry_recovered_replays = { count: 1 }
  run.k6.metrics.gate_e_capacity_retries = { count: 1 }
  run.afterWindow = probe(1); run.afterDrain = probe(1)
  const report = analyzeRun(run)
  assert.deepEqual(report.validationErrors, [])
  assert.equal(report.counts.recovered, 1)
  assert.equal(report.counts.fresh, 0)
  assert.equal(report.counts.drainCompleted, 1)
})

test('missing mandatory metrics and negative counters fail validation', () => {
  const missing = baseline(); delete missing.k6.metrics.iterations
  assert.ok(analyzeRun(missing).validationErrors.some((message) => message.includes('missing required')))
  const negative = baseline(); negative.k6.metrics.iterations.count = -1
  assert.ok(analyzeRun(negative).validationErrors.some((message) => message.includes('invalid count')))
})

test('a no-work scrape control is deducted from request SQL and model calls', () => {
  const run = baseline()
  run.manifest.scrapeCorrection = true
  run.metricsControl = 'ptool_prisma_sql_events_total 0\nptool_prisma_call_duration_seconds_count{model="raw",action="queryRaw"} 0\n'
  run.metricsBefore = 'ptool_prisma_sql_events_total 1\nptool_prisma_call_duration_seconds_count{model="raw",action="queryRaw"} 1\n'
  run.metricsAfter = 'ptool_prisma_sql_events_total 32\nptool_prisma_call_duration_seconds_count{model="raw",action="queryRaw"} 2\nptool_prisma_call_duration_seconds_count{model="Test",action="findUnique"} 10\n'
  const report = analyzeRun(run)
  assert.deepEqual(report.validationErrors, [])
  assert.equal(report.cost.rawSqlEvents, 31)
  assert.equal(report.cost.sqlEvents, 30)
  assert.deepEqual(report.cost.prismaCalls, [{ labels: '{model="Test",action="findUnique"}', delta: 10 }])
})

test('strict baseline mode exits validation on an HTTP failure even when counters reconcile', () => {
  const run = baseline()
  run.manifest.requireAllFresh = true
  run.k6.metrics.gate_e_fresh_completions.count = 9
  run.k6.metrics.gate_e_eventual_success.count = 9
  run.k6.metrics.gate_e_eventual_failure = { count: 1 }
  run.k6.metrics.gate_e_http_2xx.count = 9
  run.k6.metrics.gate_e_http_4xx = { count: 1 }
  run.afterWindow = probe(9); run.afterDrain = probe(9)
  assert.ok(analyzeRun(run).validationErrors.some((message) => message.includes('all-fresh baseline')))
})
