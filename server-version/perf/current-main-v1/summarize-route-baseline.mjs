/** Fail-closed, credential-free rollup of isolated current-main HTTP runs. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const routeCases = [
  ['SCALE_STANDALONE', 'scaleTypicalSteady'],
  ['COGNITIVE_AUTH', 'cognitiveNbackStandardSteady'],
  ['COGNITIVE_PUBLIC', 'publicCognitiveSteady'],
  ['SJT_STANDALONE', 'sjtLinear10Steady'],
  ['QUESTIONNAIRE_SCALE_AUTH', 'authQuestionnaireScaleSteady'],
  ['QUESTIONNAIRE_FORM_AUTH', 'sameParentSteady'],
  ['QUESTIONNAIRE_SCALE_PUBLIC', 'publicQuestionnaireScaleSteady'],
  ['QUESTIONNAIRE_FORM_PUBLIC', 'publicQuestionnaireFormSteady'],
  ['COMPOSITE_SCALE_AUTH', 'authCompositeScaleSteady'],
  ['COMPOSITE_SJT_AUTH', 'authCompositeSituationalSteady'],
  ['COMPOSITE_FORM_AUTH', 'authCompositeFormSteady'],
  ['COMPOSITE_SCALE_PUBLIC', 'publicCompositeScaleSteady'],
  ['COMPOSITE_SJT_PUBLIC', 'publicCompositeSituationalSteady'],
  ['COMPOSITE_FORM_PUBLIC', 'publicCompositeFormSteady'],
]
const domainCases = [
  ['COMPOSITE_SCALE_AUTH_RELATIONAL', 'relationalCompositeScaleSteady', 'LEGACY_COURSE'],
  ['COMPOSITE_SCALE_AUTH_ORGANIZATION', 'organizationCompositeScaleSteady', 'ORGANIZATION_RUN'],
]
const prefix = process.env.PERF_RUN_PREFIX
const evidenceDir = process.env.PERF_EVIDENCE_DIR
const inventoryFile = process.env.PERF_ROUTE_INVENTORY
if (!prefix || !evidenceDir || !inventoryFile) throw new Error('PERF_RUN_PREFIX, PERF_EVIDENCE_DIR, PERF_ROUTE_INVENTORY are required')
const inventory = new Map(readFileSync(inventoryFile, 'utf8').trim().split('\n').slice(1).map((line) => {
  const cells = line.split(',')
  return [cells[0], { method: cells[1], path: cells[2], family: cells[3], authMode: cells[4], container: cells[5] }]
}))
if (inventory.size !== routeCases.length || routeCases.some(([id]) => !inventory.has(id))) {
  throw new Error('the 14-case route inventory changed; update baseline mapping')
}
const read = (group, name) => JSON.parse(readFileSync(`${prefix}${group}/${name}`, 'utf8'))
const routeLabel = (labels) => /(?:^|,)route="([^"]+)"/.exec(labels)?.[1] ?? null
const rows = []
for (const [caseId, group, policyDomain = 'GENERIC'] of [...routeCases, ...domainCases]) {
  const expected = inventory.get(caseId) ?? inventory.get('COMPOSITE_SCALE_AUTH')
  const manifest = read(group, 'manifest.json')
  const report = read(group, 'summary.json')
  const counts = report.counts
  if (manifest.group !== group || report.group !== group || manifest.requireAllFresh !== true
    || manifest.sqlEventMode !== true || manifest.scrapeCorrection !== true
    || !manifest.database?.tables?.length || !manifest.fixtureChecksum
    || report.validationErrors.length || report.capacityEligible !== false
    || counts?.started !== 1 || counts?.fresh !== 1 || counts?.recovered !== 0
    || counts?.replay !== 0 || counts?.eventualFailure !== 0 || counts?.dropped !== 0
    || counts?.windowCompleted !== 1 || counts?.drainCompleted !== 1
    || report.cost?.sqlEvents === null || !Number.isSafeInteger(report.cost?.sqlEvents)
    || report.cost.scrapeCorrected !== true) {
    throw new Error(`invalid all-fresh SQL evidence for ${group}`)
  }
  const routeSamples = report.cost.httpRoutes.filter((sample) => sample.delta > 0)
  if (routeSamples.length !== 1 || routeSamples[0].delta !== 1 || routeLabel(routeSamples[0].labels) !== expected.path) {
    throw new Error(`actual HTTP route does not match inventory for ${group}`)
  }
  const modelCalls = report.cost.prismaCalls.map((sample) => ({ labels: sample.labels, count: sample.delta }))
  const phases = report.cost.phaseLatencyMs.map((sample) => ({
    labels: sample.labels, count: sample.count, meanMs: sample.meanMs,
  }))
  rows.push({
    caseId, group, policyDomain, routeTemplate: expected.path,
    sqlEvents: report.cost.sqlEvents, rawSqlEvents: report.cost.rawSqlEvents,
    logicalPrismaCalls: modelCalls.reduce((sum, sample) => sum + sample.count, 0),
    modelCalls, phases,
    networkResponseBytes: counts.responseBytes,
    oneRequestDurationMs: counts.p50Ms,
    durableWindow: counts.windowCompleted, durableDrain: counts.drainCompleted,
    manifest: {
      baseSha: manifest.baseSha, observedMainSha: manifest.mainObservedSha,
      runtimeHeadSha: manifest.headSha, fixtureChecksum: manifest.fixtureChecksum,
      startedAt: manifest.startedAt, endedAt: manifest.endedAt,
      postgresVersion: manifest.database.postgresVersion,
      qualifiedLoadGenerator: manifest.qualifiedLoadGenerator,
    },
    database: manifest.database,
  })
}
const ordinary = rows.slice(0, routeCases.length)
if (new Set(ordinary.map((row) => row.manifest.fixtureChecksum)).size !== 1
  || new Set(rows.map((row) => row.manifest.runtimeHeadSha)).size !== 1
  || new Set(rows.map((row) => row.manifest.baseSha)).size !== 1) {
  throw new Error('route baseline batches do not share one fixture checksum and runtime candidate')
}
const databaseShape = rows[0].database
const tableRanges = databaseShape.tables.map(({ table }) => {
  const all = rows.map((row) => row.database.tables.find((item) => item.table === table)?.exactRows)
  if (all.some((value) => !Number.isSafeInteger(value))) throw new Error(`missing table cardinality for ${table}`)
  return { table, minRows: Math.min(...all), maxRows: Math.max(...all),
    indexes: databaseShape.tables.find((item) => item.table === table).indexes,
    initialLastAnalyze: databaseShape.tables.find((item) => item.table === table).lastAnalyze,
    initialLastAutoAnalyze: databaseShape.tables.find((item) => item.table === table).lastAutoAnalyze }
})
const output = {
  schemaVersion: 1, planId: 'PERF-01', candidateRuntimeSha: rows[0].manifest.runtimeHeadSha,
  baseSha: rows[0].manifest.baseSha, observedMainSha: rows[0].manifest.observedMainSha,
  ordinaryRouteCount: ordinary.length, policyDomainSamples: domainCases.length,
  sharedHostCapacityQualified: false, postgresVersion: databaseShape.postgresVersion,
  fixtureChecksum: ordinary[0].manifest.fixtureChecksum, tableRanges,
  rows: rows.map(({ database: _database, ...row }) => row),
}
mkdirSync(evidenceDir, { recursive: true })
writeFileSync(resolve(evidenceDir, 'route-baseline.json'), `${JSON.stringify(output, null, 2)}\n`)
const csv = ['case_id,policy_domain,sql_events,raw_sql_events,logical_prisma_calls,network_response_bytes,one_request_ms,durable_window,durable_drain',
  ...rows.map((row) => [row.caseId, row.policyDomain, row.sqlEvents, row.rawSqlEvents,
    row.logicalPrismaCalls, row.networkResponseBytes, row.oneRequestDurationMs,
    row.durableWindow, row.durableDrain].join(','))]
writeFileSync(resolve(evidenceDir, 'route-baseline.csv'), `${csv.join('\n')}\n`)
if (process.env.PERF_BUDGET_CSV) {
  const budgetHeader = 'case_id,method,route_template,family,auth_mode,policy_domain,standalone_or_embedded,fresh_or_replay,last_unit,reference_versions,base_sha,head_sha,logical_calls_before,logical_calls_after,sql_statements_before,sql_statements_after,db_rows_or_bytes_before,db_rows_or_bytes_after,notes,evidence'
  const budgetRows = rows.map((row) => {
    const source = inventory.get(row.caseId) ?? inventory.get('COMPOSITE_SCALE_AUTH')
    const lastUnit = source.container === 'standalone' || source.container === 'standalone_or_relational'
      || row.caseId.startsWith('QUESTIONNAIRE_SCALE') ? 'YES' : 'NO'
    return [row.caseId, source.method, source.path, source.family, source.authMode,
      row.policyDomain, source.container, 'fresh', lastUnit, '0',
      row.manifest.baseSha, row.manifest.runtimeHeadSha, row.logicalPrismaCalls, '',
      row.sqlEvents, '', '', '',
      `network_response_bytes=${row.networkResponseBytes};single_sample_ms=${row.oneRequestDurationMs.toFixed(1)}`,
      'server-version/perf/current-main-v1/evidence/query-baseline-20260923/route-baseline.json'].join(',')
  })
  writeFileSync(resolve(process.env.PERF_BUDGET_CSV), `${budgetHeader}\n${budgetRows.join('\n')}\n`)
}
const table = rows.map((row) => `| ${row.caseId} | ${row.policyDomain} | ${row.sqlEvents} | ${row.logicalPrismaCalls} | ${row.networkResponseBytes} | ${row.oneRequestDurationMs.toFixed(1)} |`).join('\n')
writeFileSync(resolve(evidenceDir, 'route-baseline.md'), `# PERF-01 isolated PostgreSQL HTTP baseline\n\n` +
  `Runtime candidate \`${output.candidateRuntimeSha}\`, base \`${output.baseSha}\`; PostgreSQL ${output.postgresVersion}. ` +
  `Fourteen FINAL templates and two policy-domain samples each completed one first-attempt fresh request. ` +
  `All sixteen were durable by the one-second window and after drain. SQL and logical Prisma calls exclude one measured /metrics scrape.\n\n` +
  `| Route case | Policy domain | SQL events | Prisma calls | Received network bytes | One request ms |\n` +
  `| --- | --- | ---: | ---: | ---: | ---: |\n${table}\n\n` +
  `The duration column is one sample per case; it is not a useful p95 or capacity estimate. ` +
  `The k6 data_received value includes protocol overhead and is labelled network bytes. ` +
  `Phase means, model/action distributions, the raw SQL count, PostgreSQL table row ranges, indexes, and ANALYZE timestamps are in route-baseline.json. ` +
  `The API and load generator shared this Mac. CAPACITY_VERIFIED remains false. ` +
  `The ORGANIZATION_RUN row covers the assignment policy branch with a STUDENT/SELF respondent and no consent or Assessment Run execution; ` +
  `it is not a full organization campaign or observer-path benchmark.\n`)
console.log(JSON.stringify({ ordinaryRouteCount: ordinary.length, policyDomainSamples: domainCases.length, outputDir: evidenceDir }))
