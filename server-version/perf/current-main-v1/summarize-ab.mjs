import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.argv[2] || '')
if (!root.startsWith('/tmp/')) throw new Error('A/B evidence root must be under /tmp')

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
const phaseMean = (report, phase) => {
  const rows = report.cost?.phaseLatencyMs || []
  const matched = rows.filter((row) => String(row.labels).includes(`phase="${phase}"`))
  const totalCount = matched.reduce((sum, row) => sum + Number(row.count || 0), 0)
  const totalMs = matched.reduce((sum, row) => sum + Number(row.sumMs || 0), 0)
  return totalCount > 0 ? totalMs / totalCount : null
}

const rows = []
for (const name of readdirSync(root)) {
  const match = /^r([123])-(base|head)-(.+)$/.exec(name)
  if (!match) continue
  const report = JSON.parse(readFileSync(resolve(root, name, 'summary.json'), 'utf8'))
  if (report.validationErrors?.length) throw new Error(`${name}: ${report.validationErrors.join('; ')}`)
  rows.push({
    round: Number(match[1]),
    variant: match[2],
    group: match[3],
    testedSha: JSON.parse(readFileSync(resolve(root, name, 'manifest.json'), 'utf8')).testedSha,
    configuredArrivals: report.counts?.configuredArrivals ?? null,
    offered: report.counts?.offered ?? 0,
    fresh: report.counts?.fresh ?? 0,
    recovered: report.counts?.recovered ?? 0,
    retries: report.counts?.retry ?? 0,
    dropped: report.counts?.dropped ?? 0,
    eventualFailure: report.counts?.eventualFailure ?? 0,
    drainCompleted: report.counts?.drainCompleted ?? 0,
    p50Ms: report.counts?.p50Ms ?? null,
    p95Ms: report.counts?.p95Ms ?? null,
    sjtValidationMeanMs: phaseMean(report, 'sjt.validation_index'),
    snapshotParseMeanMs: phaseMean(report, 'snapshot.parse_hash'),
  })
}

const groups = [...new Set(rows.map((row) => row.group))].sort()
const comparisons = []
const failures = []
for (const group of groups) {
  const base = rows.filter((row) => row.group === group && row.variant === 'base')
  const head = rows.filter((row) => row.group === group && row.variant === 'head')
  if (base.length !== 3 || head.length !== 3) throw new Error(`${group}: expected 3 base and 3 head rounds`)
  const baseP95 = median(base.map((row) => row.p95Ms))
  const headP95 = median(head.map((row) => row.p95Ms))
  const delta = headP95 - baseP95
  const allowed = Math.max(baseP95 * 0.10, 10)
  const completionRate = (row) => row.offered > 0 ? row.drainCompleted / row.offered : 0
  const dropRate = (row) => row.offered > 0 ? row.dropped / row.offered : 0
  const failureRate = (row) => row.offered > 0 ? row.eventualFailure / row.offered : 0
  const baseCompletionRate = median(base.map(completionRate))
  const headCompletionRate = median(head.map(completionRate))
  const baseDropRate = median(base.map(dropRate))
  const headDropRate = median(head.map(dropRate))
  const baseFailureRate = median(base.map(failureRate))
  const headFailureRate = median(head.map(failureRate))
  const regression = delta > allowed
    || headCompletionRate + 1e-9 < baseCompletionRate
    || headDropRate > baseDropRate + 1e-9
    || headFailureRate > baseFailureRate + 1e-9
  if (regression) failures.push(
    `${group}: p95 ${baseP95.toFixed(2)} -> ${headP95.toFixed(2)} ms, completion ${(baseCompletionRate * 100).toFixed(2)}% -> ${(headCompletionRate * 100).toFixed(2)}%, drop ${(baseDropRate * 100).toFixed(2)}% -> ${(headDropRate * 100).toFixed(2)}%, failure ${(baseFailureRate * 100).toFixed(2)}% -> ${(headFailureRate * 100).toFixed(2)}%`,
  )
  comparisons.push({
    group,
    baseP95Ms: baseP95,
    headP95Ms: headP95,
    p95DeltaMs: delta,
    baseCompletionRate,
    headCompletionRate,
    baseDropRate,
    headDropRate,
    baseFailureRate,
    headFailureRate,
    baseRetries: median(base.map((row) => row.retries)),
    headRetries: median(head.map((row) => row.retries)),
    baseSjtValidationMeanMs: median(base.map((row) => row.sjtValidationMeanMs).filter((v) => v !== null)),
    headSjtValidationMeanMs: median(head.map((row) => row.sjtValidationMeanMs).filter((v) => v !== null)),
    regression,
  })
}

writeFileSync(resolve(root, 'ab-summary.json'), JSON.stringify({ schemaVersion: 2, rows, comparisons, failures }, null, 2) + '\n')
const md = [
  '# Phase 0 same-host A/B',
  '',
  '| workload | base p95 ms | head p95 ms | p95 delta | base/head completion | base/head retry | base/head drop rate | verdict |',
  '|---|---:|---:|---:|---:|---:|---:|---|',
  ...comparisons.map((row) => `| ${row.group} | ${row.baseP95Ms.toFixed(2)} | ${row.headP95Ms.toFixed(2)} | ${row.p95DeltaMs.toFixed(2)} | ${(row.baseCompletionRate * 100).toFixed(2)}%/${(row.headCompletionRate * 100).toFixed(2)}% | ${row.baseRetries}/${row.headRetries} | ${(row.baseDropRate * 100).toFixed(2)}%/${(row.headDropRate * 100).toFixed(2)}% | ${row.regression ? 'REGRESSION' : 'NON-DEGRADED'} |`),
  '',
  failures.length ? `Failures: ${failures.join('; ')}` : 'No A/B non-degradation failure.',
  '',
].join('\n')
writeFileSync(resolve(root, 'ab-summary.md'), md)
console.log(md)
if (failures.length) process.exitCode = 1
