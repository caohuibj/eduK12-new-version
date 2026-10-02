import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { validateResultDisclosureContract, type ResultAudience } from '../assessment-policy/result-disclosure'
import { relationalProductRegistry } from '../assessment-relational/product-registry'
import { resolveOrganizationAccessContext } from '../organization/access'
import type { ReportingPrincipal } from './authorization'
import { getPublishedReportingSpec } from './spec'
import { reportingFail, type ReportingArtifactRecord } from './types'

const hidden = (): never => reportingFail('REPORT_NOT_FOUND', 'reporting resource not found', 404)

/** Legacy source runtimes retain their native policy; declared Run contracts only narrow it. */
export async function governedArtifactMetrics(input: { artifact: ReportingArtifactRecord; principal: ReportingPrincipal; individual?: boolean; tx?: Prisma.TransactionClient }) {
  const { artifact, principal } = input
  const db=input.tx??prisma
  const directSource = artifact.analysisKind === 'GROUP' ? artifact.artifactPayload.source
    : artifact.analysisKind === 'PROTECTED_FEEDBACK' ? { runId: artifact.sourceRunId, trackId: artifact.sourceTrackId } : null
  const tracks = await db.$queryRaw<Array<{ family: string; key: string; version: string; policy: any; hash: string; closedAt: Date | null }>>`
    SELECT t.resource_family AS family,t.resource_key AS key,t.resource_version AS version,
      t.frozen_resource_policy AS policy,t.resource_policy_hash AS hash,r.closed_at AS "closedAt"
    FROM assessment_run_tracks t JOIN assessment_runs r ON r.id=t.run_id AND r.organization_id=t.organization_id
    WHERE t.organization_id=${artifact.organizationId}
      AND ((t.run_id=${directSource?.runId ?? null} AND t.id=${directSource?.trackId ?? null}) OR EXISTS (
        SELECT 1 FROM reporting_series_waves w JOIN reporting_analysis_artifact_waves aw
          ON aw.wave_id=w.id AND aw.organization_id=w.organization_id AND aw.series_id=w.series_id
        WHERE aw.artifact_id=${artifact.id} AND w.organization_id=t.organization_id AND w.source_run_id=t.run_id AND w.source_track_id=t.id
      ))
  `
  if (!tracks.length) return hidden()
  if (!tracks.some(t => t.policy?.resultDisclosure)) return null
  // A mixed legacy/governed series cannot use the legacy path to widen disclosure.
  if (tracks.some(t => !t.policy?.resultDisclosure)) return hidden()
  const context = await resolveOrganizationAccessContext({ organizationId: artifact.organizationId, principal },input.tx)
  if (!context?.membershipId || context.organizationStatus !== 'ACTIVE' || context.explicitDenies.some(d => ['*', 'REPORT_READ'].includes(d))) return hidden()
  const audience: ResultAudience = context.capabilities.includes('PSYCHOLOGY_STAFF') || context.personas.includes('COUNSELOR') ? 'PROFESSIONAL'
    : context.personas.includes('TEACHER') ? 'TEACHER' : 'ORGANIZATION'
  const spec = await getPublishedReportingSpec(artifact.specId,input.tx)
  let allowed = spec.definition.metricRules.map(r => r.metricId)
  for (const track of tracks) {
    if (canonicalHash(track.policy) !== track.hash) return hidden()
    const entry = relationalProductRegistry.findExact({ resourceKind: track.family as any, resourceKey: track.key, resourceVersion: track.version })
    if (!entry || entry.releaseStatus !== 'PUBLISHED' || !entry.resultDisclosure || canonicalHash(entry.resultDisclosure) !== canonicalHash(track.policy.resultDisclosure)) return hidden()
    const contract = validateResultDisclosureContract(track.policy.resultDisclosure)
    const rule = contract.audiences[audience]
    const individual = input.individual || artifact.analysisKind === 'INDIVIDUAL_LONGITUDINAL'
    if (individual ? rule.mode !== 'INDIVIDUAL_SUMMARY' : !rule.mode.includes('AGGREGATE')) return hidden()
    if (rule.mode === 'DELAYED_AGGREGATE' && (!track.closedAt || Date.now() < track.closedAt.getTime() + rule.delaySeconds! * 1000)) return hidden()
    const keys = artifact.analysisKind === 'INDIVIDUAL_LONGITUDINAL' ? rule.longitudinalMetricKeys : rule.metricKeys
    allowed = allowed.filter(id => spec.definition.metricRules.some(r => r.metricId === id && keys.includes(r.sourceMetricKey)))
  }
  if (!allowed.length) return hidden()
  return allowed
}

/** Existing report-engine DTOs are cloned and narrowed, never changed in storage. */
export function narrowGovernedProjection<T>(projection: T, allowed: readonly string[] | null): T {
  if (allowed === null) return projection
  const keys = new Set(allowed)
  const visit = (value: any): any => {
    if (Array.isArray(value)) return value.map(visit)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, key === 'metrics' && entry && typeof entry === 'object'
      ? Object.fromEntries(Object.entries(entry).filter(([metric]) => keys.has(metric)).map(([metric, v]) => [metric, visit(v)])) : visit(entry)]))
  }
  return visit(projection)
}
