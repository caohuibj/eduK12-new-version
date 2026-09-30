import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { resolveOrganizationAccessContext } from '../organization/access'
import { relationalProductRegistry } from '../assessment-relational/product-registry'
import { validateResultDisclosureContract } from '../assessment-policy/result-disclosure'
import { readReportingArtifactRecord } from './artifact'
import { readExactReportingSeriesWavesBatch } from './series'
import { getPublishedReportingSpec } from './spec'
import { reportingFail } from './types'
import { projectParticipantLongitudinal } from './participantProjection'

const hidden = (): never => reportingFail('REPORT_NOT_FOUND', 'reporting resource not found', 404)

export async function readParticipantLongitudinal(userId: string, artifactId: string) {
  // Preflight exact ownership before reading the private artifact or its provenance.
  const own = await prisma.$queryRaw<Array<{ organizationId: string }>>`
    SELECT organization_id AS "organizationId" FROM reporting_analysis_artifacts
    WHERE id=${artifactId} AND analysis_kind='INDIVIDUAL_LONGITUDINAL' AND subject_user_id=${userId} LIMIT 1
  `
  if (!own[0]) return hidden()
  const organizationId = own[0].organizationId
  const currentAccess = async () => {
    const context = await resolveOrganizationAccessContext({ organizationId, principal: { userId, platformRole: 'STANDARD' } })
    if (!context?.membershipId || context.organizationStatus !== 'ACTIVE' || context.explicitDenies.some(d => ['*', 'REPORT_READ', 'PARTICIPANT_REPORT_READ', 'ORG_INDIVIDUAL_REPORT_V1'].includes(d))) hidden()
  }
  await currentAccess()
  const artifact = await readReportingArtifactRecord(artifactId)
  if (artifact.analysisKind !== 'INDIVIDUAL_LONGITUDINAL' || artifact.subjectUserId !== userId || artifact.organizationId !== organizationId) return hidden()
  const waves = await readExactReportingSeriesWavesBatch({ organizationId, seriesId: artifact.seriesId, bindings: artifact.artifactPayload.waveBindings })
  const spec = await getPublishedReportingSpec(artifact.specId)
  if (spec.definition.analysisKind !== 'INDIVIDUAL_LONGITUDINAL') return hidden()
  const definition = spec.definition
  let allowedMetricIds = definition.metricRules.map(r => r.metricId)
  for (const wave of waves) {
    const observations = [...wave.inputManifest.resolved, ...wave.inputManifest.unresolved]
    if (observations.length !== 1 || observations[0].subjectUserId !== userId) return hidden()
    const tracks = await prisma.$queryRaw<Array<{ family: string; key: string; version: string; policy: any; hash: string }>>`
      SELECT t.resource_family AS family, t.resource_key AS key, t.resource_version AS version,
        t.frozen_resource_policy AS policy, t.resource_policy_hash AS hash
      FROM assessment_run_tracks t JOIN assessment_runs r ON r.organization_id=t.organization_id AND r.id=t.run_id
      WHERE t.organization_id=${organizationId} AND t.run_id=${wave.sourceRunId} AND t.id=${wave.sourceTrackId} AND r.status IN ('PUBLISHED','CLOSED')
    `
    const track = tracks[0]
    if (!track?.policy || canonicalHash(track.policy) !== track.hash || !track.policy.resultDisclosure) return hidden()
    // Current content may revoke access; an unknown or changed contract cannot grant visibility.
    const entry = relationalProductRegistry.findExact({ resourceKind: track.family as any, resourceKey: track.key, resourceVersion: track.version })
    if (!entry || entry.releaseStatus !== 'PUBLISHED' || !entry.resultDisclosure || canonicalHash(entry.resultDisclosure) !== canonicalHash(track.policy.resultDisclosure)) return hidden()
    const contract = validateResultDisclosureContract(track.policy.resultDisclosure)
    const rule = contract.audiences.RESPONDENT
    if (rule.mode !== 'INDIVIDUAL_SUMMARY' || !rule.longitudinalMetricKeys.length) return hidden()
    // This participant route is SELF only; observer results cannot become subject disclosure.
    const executions = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT e.id FROM assessment_run_executions e
      JOIN assessment_run_actor_snapshots s ON s.organization_id=e.organization_id AND s.run_id=e.run_id AND s.id=e.subject_actor_snapshot_id
      JOIN assessment_run_actor_snapshots r ON r.organization_id=e.organization_id AND r.run_id=e.run_id AND r.id=e.respondent_actor_snapshot_id
      WHERE e.organization_id=${organizationId} AND e.run_id=${wave.sourceRunId} AND e.track_id=${wave.sourceTrackId}
        AND s.user_id=${userId} AND r.user_id=${userId}
        AND e.status NOT IN ('REVOKED','CANCELLED') LIMIT 2
    `
    if (executions.length !== 1 || executions[0].id !== observations[0].executionId) return hidden()
    allowedMetricIds = allowedMetricIds.filter(id => definition.metricRules.some(r => r.metricId === id
      && r.sourceFamily === track.family && r.sourceResourceKey === track.key && rule.longitudinalMetricKeys.includes(r.sourceMetricKey)))
  }
  if (!allowedMetricIds.length) return hidden()
  await currentAccess()
  return projectParticipantLongitudinal(artifact.artifactPayload.projection, allowedMetricIds)
}

export async function listParticipantLongitudinal(userId: string) {
  const candidates = await prisma.$queryRaw<Array<{ id: string; generatedAt: Date }>>`
    SELECT id, generated_at AS "generatedAt" FROM reporting_analysis_artifacts
    WHERE analysis_kind='INDIVIDUAL_LONGITUDINAL' AND subject_user_id=${userId}
    ORDER BY generated_at DESC,id DESC LIMIT 21
  `
  const list = []
  for (const row of candidates.slice(0, 20)) {
    try { const projection = await readParticipantLongitudinal(userId, row.id); list.push({ id: row.id, generatedAt: row.generatedAt.toISOString(), projection }) }
    catch (error) { if ((error as {statusCode?:number}).statusCode !== 404) throw error }
  }
  return { list, truncated: candidates.length > 20 }
}
