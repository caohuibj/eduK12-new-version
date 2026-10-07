import { readParentPublication } from './publication'
import { readReportingArtifactRecord } from '../reporting/artifact'
import { fail, type ParentReportSource } from './contracts'

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
  // Legacy JSON is not publication authority. Historical content requires an
  // explicit, verified publication before consent/grant can use it again.
  return publication ?? fail('PARENT_REPORT_NOT_PUBLISHED')
}
