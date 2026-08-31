#!/usr/bin/env node

/**
 * Compare two persistence-capacity reports produced by the same fixture and
 * stages. The output is deliberately limited to latency, throughput, runtime
 * samples, and the privacy-safe slow-request labels emitted by /metrics.
 */

import fs from 'node:fs'

const usage = `Usage:
  node scripts/load/compare-attribution.mjs \
    --baseline <report.json> --candidate <report.json> --output <report.json>
`

const readOption = (args, name) => {
  const index = args.indexOf(name)
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a value`)
  return args[index + 1]
}

const relativeChangePercent = (candidate, baseline) => {
  if (!Number.isFinite(candidate) || !Number.isFinite(baseline) || baseline === 0) return null
  return ((candidate - baseline) / baseline) * 100
}

const mean = (values) => values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length

const resourceNumber = (value) => {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return null
  const match = value.match(/[-+]?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

const averageContainerCpu = (stage, name) => {
  const values = (stage.resources || [])
    .filter((sample) => sample.name === name)
    .map((sample) => resourceNumber(sample.cpuPercent))
    .filter((value) => value !== null)
  return mean(values)
}

const slowRequestAttribution = (stage) => (stage.observability?.delta || [])
  .filter((sample) => sample.name === 'ptool_slow_requests_total')
  .map((sample) => ({
    threshold: sample.labels?.threshold || 'unknown',
    dominantPhase: sample.labels?.dominant_phase || 'unknown',
    count: sample.delta,
  }))
  .sort((left, right) => right.count - left.count || left.threshold.localeCompare(right.threshold) || left.dominantPhase.localeCompare(right.dominantPhase))

const topPhase = (stage) => {
  const grouped = new Map()
  for (const item of slowRequestAttribution(stage)) {
    const key = `${item.threshold}\u0000${item.dominantPhase}`
    grouped.set(key, (grouped.get(key) || 0) + item.count)
  }
  return [...grouped.entries()]
    .map(([key, count]) => {
      const [threshold, dominantPhase] = key.split('\u0000')
      return { threshold, dominantPhase, count }
    })
    .sort((left, right) => right.count - left.count)[0] || null
}

const main = () => {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log(usage)
    return
  }
  const baselinePath = readOption(args, '--baseline')
  const candidatePath = readOption(args, '--candidate')
  const outputPath = readOption(args, '--output')
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'))
  if (baseline.scenario !== candidate.scenario) throw new Error('baseline and candidate scenarios differ')

  const baselineByStage = new Map((baseline.stages || []).map((stage) => [stage.concurrency, stage]))
  const stages = (candidate.stages || []).map((current) => {
    const previous = baselineByStage.get(current.concurrency)
    if (!previous) throw new Error(`baseline is missing stage ${current.concurrency}`)
    return {
      concurrency: current.concurrency,
      baseline: {
        p50Ms: previous.latencyMs?.p50 ?? null,
        p95Ms: previous.latencyMs?.p95 ?? null,
        p99Ms: previous.latencyMs?.p99 ?? null,
        maxMs: previous.latencyMs?.max ?? null,
        throughputRps: previous.throughputRps ?? null,
        errorRate: previous.errorRate ?? null,
        backendCpuPercent: averageContainerCpu(previous, 'ptool-backend'),
      },
      candidate: {
        p50Ms: current.latencyMs?.p50 ?? null,
        p95Ms: current.latencyMs?.p95 ?? null,
        p99Ms: current.latencyMs?.p99 ?? null,
        maxMs: current.latencyMs?.max ?? null,
        throughputRps: current.throughputRps ?? null,
        errorRate: current.errorRate ?? null,
        backendCpuPercent: averageContainerCpu(current, 'ptool-backend'),
      },
      relativeChangePercent: {
        p50: relativeChangePercent(current.latencyMs?.p50, previous.latencyMs?.p50),
        p95: relativeChangePercent(current.latencyMs?.p95, previous.latencyMs?.p95),
        p99: relativeChangePercent(current.latencyMs?.p99, previous.latencyMs?.p99),
        throughput: relativeChangePercent(current.throughputRps, previous.throughputRps),
      },
      slowRequestAttribution: slowRequestAttribution(current),
      dominantSlowPhase: topPhase(current),
      metricsAvailable: Boolean(current.observability?.available && previous.observability?.available),
    }
  })

  const p50Changes = stages.map((stage) => stage.relativeChangePercent.p50).filter((value) => value !== null)
  const p95Changes = stages.map((stage) => stage.relativeChangePercent.p95).filter((value) => value !== null)
  const meanP50Change = mean(p50Changes)
  const meanP95Change = mean(p95Changes)
  const overheadPass = meanP50Change !== null && meanP95Change !== null
    && Math.abs(meanP50Change) < 5 && Math.abs(meanP95Change) < 5
  const dominantByStage = stages
    .filter((stage) => stage.dominantSlowPhase)
    .map((stage) => ({ concurrency: stage.concurrency, ...stage.dominantSlowPhase }))
  const conclusion = [
    `Compared ${stages.length} identical concurrency stages for scenario ${candidate.scenario || 'unnamed'}.`,
    meanP50Change === null || meanP95Change === null
      ? 'Instrumentation overhead could not be determined because one or more reports lacked comparable latency data.'
      : `Mean candidate latency change was p50 ${meanP50Change.toFixed(2)}% and p95 ${meanP95Change.toFixed(2)}%; the <5% overhead gate ${overheadPass ? 'passes' : 'does not pass'}.`,
    dominantByStage.length === 0
      ? 'No slow-request attribution samples were available; no causal phase conclusion is supported.'
      : `The largest observed slow-request attribution per stage is ${dominantByStage.map((item) => `${item.concurrency} VU=${item.dominantPhase} (${item.threshold}, ${item.count})`).join(', ')}.`,
  ].join(' ')

  const report = {
    generatedAt: new Date().toISOString(),
    scenario: candidate.scenario || 'unnamed',
    baselineTarget: baseline.targetLabel || 'unspecified',
    candidateTarget: candidate.targetLabel || 'unspecified',
    stages,
    overhead: {
      meanP50ChangePercent: meanP50Change,
      meanP95ChangePercent: meanP95Change,
      thresholdPercent: 5,
      pass: overheadPass,
    },
    conclusion,
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  console.log(`[attribution] report=${outputPath}`)
  console.log(`[attribution] ${conclusion}`)
  if (!overheadPass || stages.some((stage) => !stage.metricsAvailable)) process.exitCode = 1
}

try {
  main()
} catch (error) {
  console.error(`[attribution] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  console.error(usage)
  process.exitCode = 2
}
