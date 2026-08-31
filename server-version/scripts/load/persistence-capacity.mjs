#!/usr/bin/env node

/**
 * Closed-loop capacity gate for persistence endpoints.
 *
 * The fixture is intentionally external: it must contain one independently
 * authorised assessment/resume capability per virtual user. This prevents a
 * local developer credential or one shared session from making the result
 * look like a 300-user persistence test.
 */

import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'

const DEFAULT_STAGES = [100, 150, 200, 250, 300]
const DEFAULT_DURATION_SECONDS = 60
const DEFAULT_WARMUP_SECONDS = 10
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_P95_MS = 1_000
const DEFAULT_MAX_ERROR_RATE = 0.01
const DEFAULT_RESOURCE_SAMPLE_INTERVAL_MS = 5_000
const DEFAULT_METRICS_TIMEOUT_MS = 5_000

const usage = () => `Usage:
  node scripts/load/persistence-capacity.mjs --scenario-file <file> [options]

Required:
  --scenario-file <file>       External JSON fixture with users and request steps

Options:
  --base-url <url>              Override scenario.baseUrl
  --stages <list>               Comma-separated concurrency levels (default: 100,150,200,250,300)
  --duration-seconds <n>        Duration per stage (default: 60)
  --warmup-seconds <n>          Warmup duration per stage (default: 10)
  --timeout-ms <n>              Per-request timeout (default: 15000)
  --metrics-url <url>           Backend Prometheus endpoint for attribution
  --max-p95-ms <n>              Gate threshold (default: 1000)
  --max-error-rate <n>          Gate threshold as a ratio (default: 0.01)
  --containers <list>           Explicit Docker container names to sample
  --target-label <text>         Capacity target label stored in the report
  --output <file>               JSON report path (default: /tmp/...json)
  --cooldown-ms <n>             Pause between stages (default: 2000)
  --help                        Show this help
`

const readOption = (args, name, fallback = undefined) => {
  const index = args.indexOf(name)
  if (index < 0) return fallback
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

const positiveNumber = (value, name, { allowZero = false } = {}) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || (!allowZero && parsed <= 0) || (allowZero && parsed < 0)) {
    throw new Error(`${name} must be a ${allowZero ? 'non-negative' : 'positive'} number`)
  }
  return parsed
}

const parseStages = (value) => value.split(',').map((item) => {
  const stage = Number(item.trim())
  if (!Number.isSafeInteger(stage) || stage <= 0) throw new Error('--stages must contain positive integers')
  return stage
})

const parseArgs = (args) => {
  if (args.includes('--help')) {
    console.log(usage())
    process.exit(0)
  }
  const scenarioFile = readOption(args, '--scenario-file')
  if (!scenarioFile) throw new Error('--scenario-file is required')
  const durationSeconds = positiveNumber(readOption(args, '--duration-seconds', String(DEFAULT_DURATION_SECONDS)), '--duration-seconds')
  const warmupSeconds = positiveNumber(readOption(args, '--warmup-seconds', String(DEFAULT_WARMUP_SECONDS)), '--warmup-seconds', { allowZero: true })
  const timeoutMs = positiveNumber(readOption(args, '--timeout-ms', String(DEFAULT_TIMEOUT_MS)), '--timeout-ms')
  const maxP95Ms = positiveNumber(readOption(args, '--max-p95-ms', String(DEFAULT_MAX_P95_MS)), '--max-p95-ms')
  const maxErrorRate = positiveNumber(readOption(args, '--max-error-rate', String(DEFAULT_MAX_ERROR_RATE)), '--max-error-rate', { allowZero: true })
  if (maxErrorRate > 1) throw new Error('--max-error-rate must be between 0 and 1')
  const cooldownMs = positiveNumber(readOption(args, '--cooldown-ms', '2000'), '--cooldown-ms', { allowZero: true })
  const stages = parseStages(readOption(args, '--stages', DEFAULT_STAGES.join(',')))
  const output = readOption(args, '--output', `/tmp/eduk12-persistence-capacity-${Date.now()}.json`)
  const containers = (readOption(args, '--containers', '') || '').split(',').map((item) => item.trim()).filter(Boolean)
  return {
    scenarioFile,
    baseUrl: readOption(args, '--base-url'),
    stages,
    durationSeconds,
    warmupSeconds,
    timeoutMs,
    metricsUrl: readOption(args, '--metrics-url'),
    maxP95Ms,
    maxErrorRate,
    cooldownMs,
    output,
    containers,
    targetLabel: readOption(args, '--target-label', 'unspecified'),
  }
}

const metricLinePattern = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|[+-]?Inf|NaN)(?:\s+\d+)?$/

const parseMetricLabels = (input = '') => {
  const labels = {}
  const pattern = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/g
  for (const match of input.matchAll(pattern)) {
    labels[match[1]] = match[2]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
  }
  return labels
}

const metricsToSamples = (text) => text.split('\n').flatMap((line) => {
  const match = line.match(metricLinePattern)
  if (!match) return []
  const value = Number(match[3])
  return Number.isFinite(value) ? [{ name: match[1], labels: parseMetricLabels(match[2]), value }] : []
})

const attributionMetricNames = (name) => name === 'ptool_slow_requests_total'
  || name === 'ptool_nodejs_event_loop_utilization'
  || name === 'ptool_nodejs_event_loop_delay_seconds'
  || name === 'ptool_nodejs_active_requests'
  || name === 'process_resident_memory_bytes'
  || name === 'process_heap_used_bytes'
  || name === 'process_heap_total_bytes'
  || name === 'ptool_prisma_errors_total'
  || name === 'ptool_prisma_call_duration_seconds_count'
  || name === 'ptool_prisma_call_duration_seconds_sum'
  || name === 'ptool_assessment_phase_duration_seconds_count'
  || name === 'ptool_assessment_phase_duration_seconds_sum'

const readMetricsSnapshot = async (metricsUrl, timeoutMs = DEFAULT_METRICS_TIMEOUT_MS) => {
  if (!metricsUrl) return { available: false, samples: [] }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(metricsUrl, { signal: controller.signal, headers: { Accept: 'text/plain' } })
    if (!response.ok) return { available: false, status: response.status, samples: [] }
    const samples = metricsToSamples(await response.text()).filter((sample) => attributionMetricNames(sample.name))
    return { available: true, status: response.status, fetchedAt: new Date().toISOString(), samples }
  } catch (error) {
    return { available: false, error: error?.name === 'AbortError' ? 'timeout' : 'network', samples: [] }
  } finally {
    clearTimeout(timeout)
  }
}

const sampleKey = (sample) => `${sample.name}\u0000${JSON.stringify(sample.labels, Object.keys(sample.labels).sort())}`

const diffMetrics = (before, after) => {
  const previous = new Map((before?.samples || []).map((sample) => [sampleKey(sample), sample]))
  return (after?.samples || []).flatMap((sample) => {
    const prior = previous.get(sampleKey(sample))
    const delta = prior ? sample.value - prior.value : sample.value
    return delta > 0 ? [{ ...sample, delta }] : []
  })
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const validateScenario = (scenario, options) => {
  if (!isObject(scenario)) throw new Error('scenario must be a JSON object')
  if (typeof (options.baseUrl || scenario.baseUrl) !== 'string' || !(options.baseUrl || scenario.baseUrl)) {
    throw new Error('--base-url or scenario.baseUrl is required')
  }
  if (!Array.isArray(scenario.users) || scenario.users.length < Math.max(...options.stages)) {
    throw new Error(`scenario.users must contain at least ${Math.max(...options.stages)} independent virtual users`)
  }
  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) throw new Error('scenario.steps must not be empty')
  for (const [index, step] of scenario.steps.entries()) {
    if (!isObject(step) || typeof step.path !== 'string' || !step.path) throw new Error(`scenario.steps[${index}].path is required`)
    const method = String(step.method || 'GET').toUpperCase()
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error(`unsupported method in scenario.steps[${index}]`)
    if (step.body !== undefined && method === 'GET') throw new Error(`GET step ${index} must not have a body`)
  }
}

const lookup = (key, user, iteration) => {
  if (key === 'userId') return user.id
  if (key === 'iteration') return iteration
  if (key === 'now') return new Date().toISOString()
  return user.variables?.[key]
}

const render = (value, user, iteration) => {
  if (Array.isArray(value)) return value.map((item) => render(item, user, iteration))
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, render(child, user, iteration)]))
  if (typeof value !== 'string') return value
  const exact = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/)
  if (exact) return lookup(exact[1], user, iteration)
  return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key) => String(lookup(key, user, iteration) ?? ''))
}

const weightedSteps = (steps) => {
  const prepared = steps.map((step) => ({ ...step, weight: Number(step.weight ?? 1) }))
  if (prepared.some((step) => !Number.isFinite(step.weight) || step.weight < 0)) throw new Error('step weights must be non-negative numbers')
  const total = prepared.reduce((sum, step) => sum + step.weight, 0)
  if (total <= 0) throw new Error('at least one step must have a positive weight')
  return { prepared, total }
}

const pickStep = (weighted) => {
  let cursor = Math.random() * weighted.total
  for (const step of weighted.prepared) {
    cursor -= step.weight
    if (cursor <= 0) return step
  }
  return weighted.prepared[weighted.prepared.length - 1]
}

const parseJsonIfPossible = async (response) => {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('json')) return null
  try {
    return await response.json()
  } catch {
    return null
  }
}

const requestOnce = async ({ baseUrl, user, step, iteration, timeoutMs }) => {
  const method = String(step.method || 'GET').toUpperCase()
  const headers = new Headers(render(user.headers || {}, user, iteration))
  headers.set('Accept', 'application/json')
  const renderedBody = step.body === undefined ? undefined : render(step.body, user, iteration)
  if (renderedBody !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const started = performance.now()
  let status = null
  let kind = 'ok'
  try {
    const response = await fetch(new URL(render(step.path, user, iteration), baseUrl), {
      method,
      headers,
      body: renderedBody === undefined ? undefined : JSON.stringify(renderedBody),
      signal: controller.signal,
    })
    status = response.status
    const payload = await parseJsonIfPossible(response)
    if (!response.ok) kind = 'http'
    else if (isObject(payload) && typeof payload.code === 'number' && payload.code !== 0) kind = 'api'
  } catch (error) {
    kind = error?.name === 'AbortError' ? 'timeout' : 'network'
  } finally {
    clearTimeout(timeout)
  }
  return {
    step: step.name || `${method} ${step.path}`,
    method,
    status,
    kind,
    latencyMs: performance.now() - started,
  }
}

const emptyMetrics = () => ({
  requests: 0,
  errors: 0,
  latencies: [],
  statusCounts: {},
  errorKinds: {},
  stepCounts: {},
})

const recordMetric = (metrics, result) => {
  metrics.requests += 1
  metrics.latencies.push(result.latencyMs)
  const statusKey = result.status === null ? 'network' : String(result.status)
  metrics.statusCounts[statusKey] = (metrics.statusCounts[statusKey] || 0) + 1
  metrics.stepCounts[result.step] = (metrics.stepCounts[result.step] || 0) + 1
  if (result.kind !== 'ok') {
    metrics.errors += 1
    metrics.errorKinds[result.kind] = (metrics.errorKinds[result.kind] || 0) + 1
  }
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const worker = async ({ baseUrl, user, weighted, until, timeoutMs, thinkTimeMs, metrics }) => {
  let iteration = 0
  while (performance.now() < until) {
    const step = pickStep(weighted)
    const result = await requestOnce({ baseUrl, user, step, iteration, timeoutMs })
    if (metrics) recordMetric(metrics, result)
    iteration += 1
    const pause = Number(step.thinkTimeMs ?? user.thinkTimeMs ?? thinkTimeMs ?? 0)
    if (pause > 0) await sleep(pause)
  }
}

const percentile = (latencies, ratio) => {
  if (latencies.length === 0) return 0
  const sorted = [...latencies].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
  return sorted[Math.max(0, index)]
}

const summarizeMetrics = (metrics, elapsedMs, options) => {
  const errorRate = metrics.requests === 0 ? 1 : metrics.errors / metrics.requests
  const summary = {
    requests: metrics.requests,
    errors: metrics.errors,
    errorRate,
    throughputRps: elapsedMs > 0 ? metrics.requests / (elapsedMs / 1000) : 0,
    latencyMs: {
      p50: percentile(metrics.latencies, 0.50),
      p95: percentile(metrics.latencies, 0.95),
      p99: percentile(metrics.latencies, 0.99),
      max: metrics.latencies.length > 0 ? Math.max(...metrics.latencies) : 0,
    },
    statusCounts: metrics.statusCounts,
    errorKinds: metrics.errorKinds,
    stepCounts: metrics.stepCounts,
  }
  summary.pass = summary.requests > 0
    && summary.errorRate <= options.maxErrorRate
    && summary.latencyMs.p95 <= options.maxP95Ms
  return summary
}

const collectDockerStats = (containers) => {
  if (containers.length === 0) return []
  try {
    const output = execFileSync(
      'docker',
      ['stats', '--no-stream', '--format', '{{json .}}', ...containers],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5_000 },
    )
    return output.split('\n').filter(Boolean).flatMap((line) => {
      try {
        const parsed = JSON.parse(line)
        return [{
          name: parsed.Name,
          cpuPercent: parsed.CPUPerc,
          memoryUsage: parsed.MemUsage,
          memoryPercent: parsed.MemPerc,
          timestamp: new Date().toISOString(),
        }]
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

const runStage = async ({ stage, scenario, options, weighted }) => {
  const users = scenario.users.slice(0, stage.concurrency)
  const resources = []
  const sample = () => resources.push(...collectDockerStats(options.containers))
  sample()
  const sampler = setInterval(sample, DEFAULT_RESOURCE_SAMPLE_INTERVAL_MS)

  const warmupUntil = performance.now() + stage.warmupSeconds * 1000
  if (stage.warmupSeconds > 0) {
    await Promise.all(users.map((user) => worker({
      baseUrl: options.baseUrl,
      user,
      weighted,
      until: warmupUntil,
      timeoutMs: options.timeoutMs,
      thinkTimeMs: scenario.thinkTimeMs,
      metrics: null,
    })))
  }

  const metricsBefore = await readMetricsSnapshot(options.metricsUrl)
  const metrics = emptyMetrics()
  const startedAt = new Date().toISOString()
  const started = performance.now()
  const until = started + stage.durationSeconds * 1000
  await Promise.all(users.map((user) => worker({
    baseUrl: options.baseUrl,
    user,
    weighted,
    until,
    timeoutMs: options.timeoutMs,
    thinkTimeMs: scenario.thinkTimeMs,
    metrics,
  })))
  const elapsedMs = performance.now() - started
  clearInterval(sampler)
  sample()
  const metricsAfter = await readMetricsSnapshot(options.metricsUrl)

  return {
    concurrency: stage.concurrency,
    durationSeconds: stage.durationSeconds,
    warmupSeconds: stage.warmupSeconds,
    startedAt,
    endedAt: new Date().toISOString(),
    ...summarizeMetrics(metrics, elapsedMs, options),
    resources,
    observability: {
      available: metricsBefore.available && metricsAfter.available,
      before: metricsBefore,
      after: metricsAfter,
      delta: diffMetrics(metricsBefore, metricsAfter),
    },
  }
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  const scenario = JSON.parse(fs.readFileSync(options.scenarioFile, 'utf8'))
  validateScenario(scenario, options)
  options.baseUrl = new URL(options.baseUrl || scenario.baseUrl).toString()
  if (options.metricsUrl) options.metricsUrl = new URL(options.metricsUrl, options.baseUrl).toString()
  const weighted = weightedSteps(scenario.steps)
  const scenarioStages = Array.isArray(scenario.stages) ? scenario.stages : []
  const stages = options.stages.map((concurrency, index) => {
    const configured = scenarioStages[index]
    return {
      concurrency,
      durationSeconds: positiveNumber(configured?.durationSeconds ?? options.durationSeconds, 'stage durationSeconds'),
      warmupSeconds: positiveNumber(configured?.warmupSeconds ?? options.warmupSeconds, 'stage warmupSeconds', { allowZero: true }),
    }
  })

  console.log(`[capacity] target=${options.targetLabel} scenario=${scenario.name || 'unnamed'} base=${options.baseUrl}`)
  console.log(`[capacity] stages=${stages.map((stage) => stage.concurrency).join(',')} users=${scenario.users.length}`)
  const results = []
  for (const stage of stages) {
    const result = await runStage({ stage, scenario, options, weighted })
    results.push(result)
    console.log(`[capacity] c=${result.concurrency} requests=${result.requests} rps=${result.throughputRps.toFixed(2)} p95=${result.latencyMs.p95.toFixed(1)}ms errors=${(result.errorRate * 100).toFixed(2)}% pass=${result.pass}`)
    if (stage !== stages[stages.length - 1] && options.cooldownMs > 0) await sleep(options.cooldownMs)
  }

  const report = {
    generatedAt: new Date().toISOString(),
    targetLabel: options.targetLabel,
    scenario: scenario.name || 'unnamed',
    baseOrigin: new URL(options.baseUrl).origin,
    stages: results,
    thresholds: { maxP95Ms: options.maxP95Ms, maxErrorRate: options.maxErrorRate },
    pass: results.length > 0 && results.every((result) => result.pass),
  }
  fs.writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  console.log(`[capacity] report=${options.output}`)
  if (!report.pass) process.exitCode = 1
}

main().catch((error) => {
  console.error(`[capacity] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  console.error(usage())
  process.exitCode = 2
})
