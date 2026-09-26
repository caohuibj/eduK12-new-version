import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { assertOrganizationGroupReportsGenerateAccess, type ReportingPrincipal } from './authorization'
import { freezeRunTrackCohort } from './cohort'
import { normalizeCohortSelector } from './cohort-selector'
import { resolveAuthoritativeRunResults } from './resultSource'
import { buildReportingWaveInputManifest, createReportingSeries, bindReportingSeriesWave } from './series'
import { getPublishedReportingSpec } from './spec'
import { generateOrganizationLongitudinalAnalysis } from './pr4Service'
import { reportingFail, type ReportingCohortSelectorInputV2, type ReportingResourceFamily, type ReportingCohortSnapshotRecord } from './types'

export async function generateAutomaticLongitudinal(input: {
  principal: ReportingPrincipal; organizationId: string; specId: string
  sources: Array<{ runId: string; trackId: string }>
  cohortSelector?: ReportingCohortSelectorInputV2
  cohortStrategy: 'WAVE_SPECIFIC' | 'BASELINE_FIXED'
  analysisKind: 'REPEATED_COHORT' | 'MATCHED_LONGITUDINAL'
  mode?: 'PAIRWISE' | 'FULL_CASE'
}) {
  if (input.sources.length < 2 || input.sources.length > 50 || new Set(input.sources.map(s => s.runId)).size !== input.sources.length) {
    reportingFail('REPORT_LONGITUDINAL_WAVES_REQUIRED', 'select two to fifty distinct measurement runs', 400)
  }
  if (input.analysisKind === 'MATCHED_LONGITUDINAL' && input.mode === 'PAIRWISE' && input.sources.length !== 2) {
    reportingFail('REPORT_LONGITUDINAL_PAIR_REQUIRED', 'pairwise comparison requires exactly two selected measurements', 400)
  }
  if (input.analysisKind === 'MATCHED_LONGITUDINAL' && !input.mode) reportingFail('REPORT_LONGITUDINAL_MODE_REQUIRED', 'select a matching mode', 400)
  if (input.analysisKind === 'REPEATED_COHORT' && input.mode) reportingFail('REPORT_LONGITUDINAL_MODE_INVALID', 'group trends do not accept a matching mode', 400)
  // Authorize the full source set before persisting any planning evidence.
  await assertOrganizationGroupReportsGenerateAccess({
    principal: input.principal,
    organizationId: input.organizationId,
    runIds: input.sources.map((source) => source.runId),
  })
  const spec = await getPublishedReportingSpec(input.specId)
  if (spec.definition.analysisKind !== input.analysisKind) reportingFail('REPORT_ANALYSIS_KIND_UNSUPPORTED', 'published spec must match the requested report', 409)
  const sources = await prisma.$queryRaw<Array<{ runId: string; trackId: string; at: Date; family: ReportingResourceFamily; key: string }>>(Prisma.sql`
    SELECT r.id AS "runId", t.id AS "trackId", r.published_at AS at, t.resource_family AS family, t.resource_key AS key
    FROM assessment_runs r JOIN assessment_run_tracks t ON t.organization_id=r.organization_id AND t.run_id=r.id
    WHERE r.organization_id=${input.organizationId} AND r.published_at IS NOT NULL AND r.status <> 'DRAFT'
      AND (${Prisma.join(input.sources.map(s => Prisma.sql`(r.id=${s.runId} AND t.id=${s.trackId})`), ' OR ')})
    ORDER BY r.published_at, r.id, t.id
  `)
  if (sources.length !== input.sources.length || sources.some(s => s.family !== sources[0].family || s.key !== sources[0].key)) {
    reportingFail('REPORT_SERIES_RESOURCE_MISMATCH', 'all measurements must belong to the same resource and organization', 409)
  }
  const selector = normalizeCohortSelector(input.cohortSelector ?? { schemaVersion: 2, clauses: [], combine: 'ALL' })
  let baseline: ReportingCohortSnapshotRecord | undefined
  const prepared = []
  for (const source of sources) {
    const cohort = await freezeRunTrackCohort({ organizationId: input.organizationId, ...source,
      generatedByUserId: input.principal.userId, cohortSelector: selector,
      baselineCohort: input.cohortStrategy === 'BASELINE_FIXED' ? baseline : undefined })
    baseline ??= cohort
    const batch = await resolveAuthoritativeRunResults(cohort)
    prepared.push({ source, cohort, batch, manifest: buildReportingWaveInputManifest(batch) })
  }
  // Include actual frozen inputs: newly completed results produce a new series,
  // rather than conflicting with or silently reusing an earlier partial Wave.
  const identity = canonicalHash({ schema: 'AutoLongitudinalV2', organizationId: input.organizationId,
    selector, strategy: input.cohortStrategy,
    waves: prepared.map(p => ({ source: { ...p.source, at: p.source.at.toISOString() }, cohort: p.cohort.cohortIdentityHash, manifest: p.manifest })) })
  await assertOrganizationGroupReportsGenerateAccess({
    principal: input.principal,
    organizationId: input.organizationId,
    runIds: prepared.map((item) => item.source.runId),
  })
  const series = await createReportingSeries({ organizationId: input.organizationId, seriesKey: `AUTO-LONG-V2:${identity}`, reuse: true,
    scope: { schemaVersion: 1, resourceFamily: sources[0].family, resourceKey: sources[0].key }, createdByUserId: input.principal.userId })
  const waveKeys: string[] = []
  for (const [i, p] of prepared.entries()) {
    const waveKey = `${p.source.at.toISOString()} / T${i + 1}`
    await bindReportingSeriesWave({ organizationId: input.organizationId, seriesId: series.id, waveKey, ordinal: i + 1,
      cohortSnapshotId: p.cohort.id, createdByUserId: input.principal.userId, preparedBatch: p.batch })
    waveKeys.push(waveKey)
  }
  return generateOrganizationLongitudinalAnalysis({ ...input, seriesId: series.id, waveKeys })
}
