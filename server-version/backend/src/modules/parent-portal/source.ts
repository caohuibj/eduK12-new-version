import { readParentPublication } from './publication'
import { readReportingArtifactRecord } from '../reporting/artifact'
import { fail, parseParentProjection, type ParentReportSource } from './contracts'

/** Only explicit, published PARENT projections in verified immutable sources qualify.
 * Existing staff/research/subject reports never become parent reports implicitly. */
export async function readParentReportSource(artifactId:string):Promise<ParentReportSource> {
  const record=await readReportingArtifactRecord(artifactId)
  if(!['PROTECTED_FEEDBACK','INDIVIDUAL_LONGITUDINAL'].includes(record.analysisKind))return fail()
  const payload=record.artifactPayload as unknown as Record<string,unknown>
  const source=payload.source as {subjectUserId?:string}|undefined
  const subjectUserId=typeof payload.subjectUserId==='string'?payload.subjectUserId:source?.subjectUserId
  if(!subjectUserId)return fail()
  const publication=await readParentPublication(record,subjectUserId)
  if(publication)return publication
  const projection=parseParentProjection(payload.parentAudience,artifactId,subjectUserId)
  if(record.analysisKind==='INDIVIDUAL_LONGITUDINAL'&&projection.policy.mode==='EDUCATIONAL_SUMMARY'&&projection.disclosedLongitudinalMetricKeys===undefined)return fail('PARENT_LONGITUDINAL_PROVENANCE_UNAVAILABLE')
  if(!projection.toolRef)return fail('PARENT_TOOL_PROVENANCE_UNAVAILABLE')
  return {artifactId,subjectUserId,organizationId:record.organizationId,policyDomain:record.policyDomain,sourceHash:record.snapshotHash,projection}
}
