import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { projectAudienceResult, validateResultDisclosureContract } from '../assessment-policy/result-disclosure'
import { relationalProductRegistry } from '../assessment-relational/product-registry'
import { resolveAuthoritativeTrackObservations } from './resultSource'
import { reportingFail } from './types'

const hidden = (): never => reportingFail('REPORT_NOT_FOUND', 'reporting resource not found', 404)
export async function readRespondentRunSummary(userId: string, executionId: string) {
  const readOwn = () => prisma.$queryRaw<Array<{ organizationId: string; runId: string; trackId: string; subjectUserId: string; relationship: string; perspective: any; family: string; key: string; version: string; policy: any; hash: string }>>`
    SELECT e.organization_id AS "organizationId",e.run_id AS "runId",e.track_id AS "trackId",s.user_id AS "subjectUserId",
      a.relationship_kind AS relationship,a.perspective,t.resource_family AS family,t.resource_key AS key,t.resource_version AS version,
      t.frozen_resource_policy AS policy,t.resource_policy_hash AS hash
    FROM assessment_run_executions e JOIN assessment_run_tracks t ON t.organization_id=e.organization_id AND t.run_id=e.run_id AND t.id=e.track_id
    JOIN assessment_run_actor_snapshots r ON r.organization_id=e.organization_id AND r.run_id=e.run_id AND r.id=e.respondent_actor_snapshot_id
    JOIN assessment_run_actor_snapshots s ON s.organization_id=e.organization_id AND s.run_id=e.run_id AND s.id=e.subject_actor_snapshot_id
    JOIN assessment_runs run ON run.organization_id=e.organization_id AND run.id=e.run_id
    JOIN organizations org ON org.id=e.organization_id
    JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id AND a.policy_domain='ORGANIZATION_RUN'
    WHERE e.id=${executionId} AND r.user_id=${userId} AND org.status='ACTIVE' AND run.status IN ('PUBLISHED','CLOSED')
      AND e.status NOT IN ('REVOKED','CANCELLED') AND a.status='COMPLETED'
      AND NOT EXISTS(SELECT 1 FROM organization_access_denies d WHERE d.organization_id=e.organization_id AND d.user_id=${userId}
        AND d.lifted_at IS NULL AND d.permission IN ('*','REPORT_READ','PARTICIPANT_REPORT_READ'))
  `
  const row = (await readOwn())[0]
  if (!row?.policy?.resultDisclosure || canonicalHash(row.policy) !== row.hash) return hidden()
  const entry = relationalProductRegistry.findExact({resourceKind:row.family as any,resourceKey:row.key,resourceVersion:row.version})
  if (!entry || entry.releaseStatus !== 'PUBLISHED' || !entry.resultDisclosure || canonicalHash(entry.resultDisclosure) !== canonicalHash(row.policy.resultDisclosure)) return hidden()
  const contract = validateResultDisclosureContract(row.policy.resultDisclosure)
  const rule = contract.audiences.RESPONDENT
  if (rule.mode === 'NONE' || rule.mode === 'COMPLETION_ONLY') return projectAudienceResult({contract,audience:'RESPONDENT',metrics:{}})
  if (rule.mode !== 'INDIVIDUAL_SUMMARY' || row.policy.analysisMode !== 'INDIVIDUAL_ONLY') return hidden()
  const batch = await resolveAuthoritativeTrackObservations({organizationId:row.organizationId,runId:row.runId,trackId:row.trackId,
    selection:{subjectUserId:row.subjectUserId,relationshipKind:row.relationship,perspective:row.perspective}})
  const result = batch.resolved.find(r => r.executionId === executionId && r.respondent.userId === userId)
  if (!result) return hidden()
  const metrics = Object.fromEntries(result.metrics.filter(m=>m.resultQuality!=='invalid').map(m=>[m.key,m.value]))
  // Recheck revocation after awaiting canonical result reads.
  const current = (await readOwn())[0]
  const currentEntry = relationalProductRegistry.findExact({resourceKind:row.family as any,resourceKey:row.key,resourceVersion:row.version})
  if (!current || current.hash !== row.hash || canonicalHash(current.policy) !== current.hash
      || !currentEntry || currentEntry.releaseStatus !== 'PUBLISHED' || !currentEntry.resultDisclosure
      || canonicalHash(currentEntry.resultDisclosure) !== canonicalHash(contract)) return hidden()
  return projectAudienceResult({contract,audience:'RESPONDENT',metrics})
}
