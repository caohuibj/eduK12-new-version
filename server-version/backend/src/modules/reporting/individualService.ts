import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { freezeRunTrackCohort } from './cohort'
import { resolveAuthoritativeRunResults } from './resultSource'
import { bindReportingSeriesWave, buildReportingWaveInputManifest, createReportingSeries } from './series'
import { getPublishedReportingSpec } from './spec'
import { createOrReuseIndividualReportingArtifact } from './artifact'
import { buildIndividualLongitudinalProjection } from './individual'
import { assertIndividualLongitudinalAccess, individualSubjectScope, type IndividualScopeInput } from './individualAuthorization'
import { reportingEvidenceFor } from './engine'
import { reportingFail, type ReportingIndividualArtifactPayloadV1, type ReportingResourceFamily } from './types'

type Source = { runId: string; trackId: string }
type SourceRow = Source & { runName: string; at: Date; family: ReportingResourceFamily; key: string; version: string; membershipId: string }
const sourceQuery = (organizationId: string, subjectUserId: string) => Prisma.sql`
  SELECT DISTINCT r.id AS "runId", t.id AS "trackId", r.name AS "runName", r.published_at AS at,
    t.resource_family AS family, t.resource_key AS key, t.resource_version AS version, actor.membership_id AS "membershipId"
  FROM assessment_run_actor_snapshots actor
  JOIN assessment_run_executions e ON e.organization_id=actor.organization_id AND e.run_id=actor.run_id AND e.subject_actor_snapshot_id=actor.id AND e.respondent_actor_snapshot_id=actor.id
  JOIN assessment_run_relationship_snapshots rel ON rel.organization_id=e.organization_id AND rel.run_id=e.run_id AND rel.id=e.relationship_snapshot_id AND rel.relationship_kind='SELF'
  JOIN assessment_runs r ON r.organization_id=e.organization_id AND r.id=e.run_id
  JOIN assessment_run_tracks t ON t.organization_id=e.organization_id AND t.run_id=e.run_id AND t.id=e.track_id
  WHERE actor.organization_id=${organizationId} AND actor.user_id=${subjectUserId} AND actor.membership_id IS NOT NULL
    AND r.published_at IS NOT NULL AND r.status <> 'DRAFT' AND t.resource_family IN ('SCALE','COGNITIVE','BUNDLE','SITUATIONAL')
`
export async function listIndividualSubjects(input: IndividualScopeInput & { page: number; pageSize: number; search?: string }) {
  const scope = await individualSubjectScope(input)
  const rows = await prisma.$queryRaw<Array<{ userId: string; name: string }>>(Prisma.sql`
    SELECT DISTINCT m.user_id AS "userId", u.username AS name FROM organization_memberships m JOIN users u ON u.id=m.user_id
    WHERE m.organization_id=${input.organizationId} AND (${scope}) AND u.username ILIKE ${'%' + (input.search ?? '') + '%'}
      AND EXISTS (SELECT 1 FROM assessment_run_actor_snapshots a WHERE a.organization_id=m.organization_id AND a.user_id=m.user_id AND a.membership_id IS NOT NULL)
    ORDER BY u.username,m.user_id LIMIT ${input.pageSize} OFFSET ${(input.page-1)*input.pageSize}
  `)
  const currentScope = await individualSubjectScope(input)
  if (rows.length) {
    const allowed = await prisma.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
      SELECT DISTINCT m.user_id AS "userId" FROM organization_memberships m
      WHERE m.organization_id=${input.organizationId} AND m.user_id IN (${Prisma.join(rows.map(r=>r.userId))}) AND (${currentScope})
    `)
    if (allowed.length !== rows.length) reportingFail('REPORT_NOT_FOUND', 'subject authority changed',404)
  }
  return { list: rows, nextPage: rows.length === input.pageSize ? input.page+1 : null }
}
export async function listIndividualSources(input: IndividualScopeInput & { subjectUserId: string; page: number; pageSize: number }) {
  await assertIndividualLongitudinalAccess(input)
  const rows = await prisma.$queryRaw<SourceRow[]>(Prisma.sql`${sourceQuery(input.organizationId,input.subjectUserId)}
    ORDER BY r.published_at DESC,r.id,t.id,actor.membership_id LIMIT ${input.pageSize} OFFSET ${(input.page-1)*input.pageSize}`)
  await assertIndividualLongitudinalAccess(input)
  return { list: rows.map(r => ({ runId: r.runId, trackId: r.trackId, runName: r.runName, publishedAt: r.at.toISOString(), resource: { family:r.family,key:r.key,version:r.version } })),
    nextPage: rows.length === input.pageSize ? input.page+1 : null }
}
export async function generateIndividualLongitudinal(input: IndividualScopeInput & { subjectUserId: string; sources: Source[]; specId: string }) {
  await assertIndividualLongitudinalAccess(input)
  if (input.sources.length < 2 || input.sources.length > 50 || new Set(input.sources.map(s=>s.runId)).size !== input.sources.length) {
    reportingFail('REPORT_LONGITUDINAL_WAVES_REQUIRED', 'select two to fifty distinct measurements', 400)
  }
  const spec = await getPublishedReportingSpec(input.specId)
  if (spec.definition.analysisKind !== 'INDIVIDUAL_LONGITUDINAL') return reportingFail('REPORT_SPEC_INVALID', 'individual longitudinal spec required', 409)
  const sources = await prisma.$queryRaw<SourceRow[]>(Prisma.sql`${sourceQuery(input.organizationId,input.subjectUserId)}
    AND (${Prisma.join(input.sources.map(s=>Prisma.sql`(r.id=${s.runId} AND t.id=${s.trackId})`), ' OR ')}) ORDER BY r.published_at,r.id,t.id,actor.membership_id`)
  if (sources.length !== input.sources.length || sources.some(s=>s.family !== sources[0].family || s.key !== sources[0].key)) {
    reportingFail('REPORT_INDIVIDUAL_SOURCE_INVALID', 'each source must contain this subject with the same resource identity', 409)
  }
  const prepared = []
  for (const source of sources) {
    const cohort = await freezeRunTrackCohort({ ...source, organizationId: input.organizationId, generatedByUserId: input.principal.userId,
      cohortSelector: { schemaVersion:2,combine:'ALL',clauses:[{kind:'MEMBERSHIP_IDS',membershipIds:[source.membershipId]}] } })
    if (cohort.members.length !== 1 || cohort.members[0].userId !== input.subjectUserId) reportingFail('REPORT_INDIVIDUAL_SOURCE_INVALID', 'ambiguous individual source',409)
    const batch = await resolveAuthoritativeRunResults(cohort)
    prepared.push({source,cohort,batch,manifest:buildReportingWaveInputManifest(batch)})
  }
  if (prepared.filter(p=>p.batch.resolved.length === 1).length < 2) reportingFail('REPORT_INDIVIDUAL_RESULTS_REQUIRED', 'at least two completed measurements required',409)
  await assertIndividualLongitudinalAccess(input)
  const identity = canonicalHash({schema:'IndividualLongitudinalSeriesV1',organizationId:input.organizationId,subjectUserId:input.subjectUserId,
    waves:prepared.map(p=>({cohort:p.cohort.cohortIdentityHash,manifest:p.manifest}))})
  const series = await createReportingSeries({organizationId:input.organizationId,seriesKey:`AUTO-IND-V1:${identity}`,reuse:true,
    scope:{schemaVersion:1,resourceFamily:sources[0].family,resourceKey:sources[0].key},createdByUserId:input.principal.userId})
  const waves = []
  for (const [i,p] of prepared.entries()) waves.push(await bindReportingSeriesWave({organizationId:input.organizationId,seriesId:series.id,
    waveKey:`${p.source.at.toISOString()} / T${i+1}`,ordinal:i+1,cohortSnapshotId:p.cohort.id,preparedBatch:p.batch,createdByUserId:input.principal.userId}))
  const projection = buildIndividualLongitudinalProjection({subjectUserId:input.subjectUserId,waves,spec:spec.definition})
  const waveBindings = waves.map(w=>({waveId:w.id,waveKey:w.waveKey,ordinal:w.ordinal,cohortSnapshotId:w.cohortSnapshotId,inputIdentityHash:w.inputIdentityHash,snapshotHash:w.snapshotHash}))
  const generatedAt = new Date()
  const analysisIdentityHash = canonicalHash({schema:'IndividualLongitudinalAnalysisV1',subjectUserId:input.subjectUserId,seriesIdentityHash:series.seriesIdentityHash,specId:spec.id,specHash:spec.specHash,waveBindings})
  const payload: ReportingIndividualArtifactPayloadV1 = {schemaVersion:1,artifactId:randomUUID(),organizationId:input.organizationId,
    analysisKind:'INDIVIDUAL_LONGITUDINAL',policyDomain:'ORG_INDIVIDUAL_REPORT_V1',subjectUserId:input.subjectUserId,
    source:{kind:'SERIES',seriesId:series.id,seriesIdentityHash:series.seriesIdentityHash},specId:spec.id,specHash:spec.specHash,analysisIdentityHash,
    generatedByUserId:input.principal.userId,generatedAt:generatedAt.toISOString(),waveBindings,options:{},
    maturityProfile:reportingEvidenceFor(waves.flatMap(w=>w.inputManifest.resolved),spec.definition.reportEvidenceCeiling).profile,projection}
  await assertIndividualLongitudinalAccess(input)
  const artifact = await createOrReuseIndividualReportingArtifact({organizationId:input.organizationId,seriesId:series.id,specId:spec.id,analysisIdentityHash,
    artifactPayload:payload,snapshotHash:canonicalHash(payload),waveBindings,generatedByUserId:input.principal.userId,generatedAt})
  await assertIndividualLongitudinalAccess(input)
  return {artifactId:artifact.id,generatedAt:artifact.generatedAt.toISOString(),projection:artifact.artifactPayload.projection}
}
