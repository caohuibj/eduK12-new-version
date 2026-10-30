import { readEducationRespondentScaleReport } from '../reporting/education-scale-personal-report.service'
import { prisma } from '../../config/database'
import { readRespondentRunSummary } from '../reporting/respondentSummary'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'
import { hashScaleDefinition,validateScaleDefinition } from '../scale/scale-definition'
import type { ScaleDefinitionV2 } from '../scale/scale-definition'
import { teacherPilotContentIssues } from './teacherPilotContent'
import {resolveAuthoritativeTrackObservations} from '../reporting/resultSource'
import {canonicalHash} from '../assessment-runtime/canonical'

export class TeacherScaleReportError extends Error{
  constructor(public readonly code:string,public readonly statusCode=404){
    super(code);this.name='TeacherScaleReportError'
  }
}
function denied():never {throw new TeacherScaleReportError('HUITEACHER_PERSONAL_REPORT_NOT_FOUND')}

/** The canonical Reporting source owns scoring and audience disclosure.
 * This projector may provide only authored, scientifically reviewed wording
 * from the exact frozen Scale version; it never re-scores or infers cutoffs.
 */
export async function readTeacherPersonalScaleReport(input:{
  actorUserId:string;executionId:string
}){
  const libraryReport = await readEducationRespondentScaleReport({ ...input, product: 'TEACHER' })
  if (libraryReport) return libraryReport
  const records=await prisma.$queryRaw<Array<{
    organizationId:string;resourceKey:string;resourceVersion:string;runId:string;trackId:string;
    definitionHash:string;scaleDefinition:unknown;title:string;
    sourceStatus:string;scaleStatus:string
  }>>`
    SELECT execution."organization_id" AS "organizationId",
      track."resource_key" AS "resourceKey",
      track."resource_version" AS "resourceVersion",
      track."run_id" AS "runId",track."id" AS "trackId",
      resource."definition_hash" AS "definitionHash",
      scale."definition" AS "scaleDefinition",scale."name" AS "title",
      resource."status" AS "sourceStatus",scale."status" AS "scaleStatus"
    FROM "assessment_run_executions" execution
    JOIN "assessment_runs" run
      ON run."organization_id"=execution."organization_id"
      AND run."id"=execution."run_id"
      AND run."status" IN ('PUBLISHED','CLOSED')
    JOIN "assessment_run_tracks" track
      ON track."organization_id"=execution."organization_id"
      AND track."run_id"=execution."run_id"
      AND track."id"=execution."track_id"
      AND track."resource_family"='SCALE'
      AND (track."resource_key" LIKE 'teacher-scale:%:INDIVIDUAL' OR track."resource_key" LIKE 'teacher-scale:%:GROUP')
    JOIN "registered_assessment_resources" resource
      ON resource."resource_key"=track."resource_key"
      AND resource."resource_version"=track."resource_version"
    JOIN "scales" scale ON scale."id"=resource."scale_id"
    JOIN "assessment_run_actor_snapshots" subject
      ON subject."organization_id"=execution."organization_id"
      AND subject."run_id"=execution."run_id"
      AND subject."id"=execution."subject_actor_snapshot_id"
      AND subject."user_id"=${input.actorUserId}
      AND subject."actor_role"='TEACHER'
    JOIN "assessment_run_actor_snapshots" respondent
      ON respondent."organization_id"=execution."organization_id"
      AND respondent."run_id"=execution."run_id"
      AND respondent."id"=execution."respondent_actor_snapshot_id"
      AND respondent."user_id"=${input.actorUserId}
      AND respondent."actor_role"='TEACHER'
    JOIN "huiteacher_evaluation_run_links" link
      ON link."organization_id"=execution."organization_id"
      AND link."run_id"=execution."run_id"
    WHERE execution."id"=${input.executionId}
      AND execution."status"='COMPLETED'
    LIMIT 1
  `
  const record=records[0]
  if(!record||!['PUBLISHED','RETIRED'].includes(record.sourceStatus)
    ||record.scaleStatus!=='PUBLISHED')
    denied()
  const scope=await resolveEducationProductMemberScope({
    actorUserId:input.actorUserId,organizationId:record.organizationId,
    product:'HUITEACHER',
  })
  if(!scope)denied()
  // Require an exact, already-validated immutable scoring version even
  // for historical personalized feedback.
  const parsed=validateScaleDefinition(record.scaleDefinition,{
    instrumentClass:'CUSTOM_DESCRIPTIVE',forPublish:true,
  })
  const def=parsed.definition as ScaleDefinitionV2|undefined
  if(!def||parsed.issues.some(issue=>issue.severity==='error')
    ||def.respondentType!=='teacher_self_report'
    ||hashScaleDefinition(def)!==record.definitionHash
    ||def.referencePolicy.type!=='none'
    ||def.license.status!=='self_authored'
    ||def.license.redistribution!=='allowed'
    ||teacherPilotContentIssues(def).length>0)
    denied()
  // This calls current population & respondent authority again and refuses
  // School data, unrecognized sources, and organization-facing projections.
  const group=record.resourceKey.endsWith(':GROUP')
  const current=group?await readRespondentRunSummary(input.actorUserId,input.executionId,{disclosureOnly:true})
    :await readRespondentRunSummary(input.actorUserId,input.executionId)
  if(current.mode!=='INDIVIDUAL_SUMMARY'||current.state!=='READY')
    return {kind:'HUITEACHER_PERSONAL_DESCRIPTION' as const,
      state:'WITHHELD' as const,mode:current.mode}
  let projection:Record<string,unknown>=('metrics' in current && current.metrics
    &&typeof current.metrics==='object')?current.metrics:{}
  if(group){
    // This existing dedicated reader has verified one original Teacher Scale,
    // its frozen definition and the actual same-person completed execution.
    // Original descriptive Scale feedback is immediate; native C/P/R and
    // scheduled education reports retain their separate dedicated reader.
    const allowed='metricKeys' in current?new Set(current.metricKeys):new Set<string>()
    const batch=await resolveAuthoritativeTrackObservations({organizationId:record.organizationId,runId:record.runId,trackId:record.trackId,
      selection:{subjectUserId:input.actorUserId,relationshipKind:'SELF',perspective:'SELF_REPORT'}})
    const own=batch.resolved.find(row=>row.executionId===input.executionId&&row.respondent.userId===input.actorUserId)
    if(!own)denied()
    projection=Object.fromEntries(own.metrics.filter(metric=>allowed.has(metric.key)&&metric.resultQuality!=='invalid').map(metric=>[metric.key,metric.value]))
    const latest=await readRespondentRunSummary(input.actorUserId,input.executionId,{disclosureOnly:true})
    if(canonicalHash(latest)!==canonicalHash(current))denied()
  }
  const metrics=Object.entries(projection).map(([key,value])=>{
    const score=def.scoring.scores.find(s=>s.key===key)
    if(!score)denied()
    const wording=def.report.interpretations.find(i=>i.scoreKey===key
      &&i.source.type==='score_only')
    const safeValue=typeof value==='number'&&Number.isFinite(value)?value:null
    return {key,label:score.label,value:safeValue,
      precision:score.displayPrecision,direction:score.direction,
      ...(wording?{headline:wording.headline,summary:wording.summary,
        guidance:wording.guidance.map(g=>({category:g.category,text:g.text}))}:{})
    }
  })
  return {
    kind:'HUITEACHER_PERSONAL_DESCRIPTION' as const,
    state:'READY' as const,title:record.title,source:'AUTHORIZED_SCALE_V2' as const,
    scientificMaturity:'PILOT' as const,metrics,
    disclaimer:def.report.disclaimer,
    limitations:def.report.limitations,
    explanation:'描述性自评结果依据已发布计分规则形成，不是常模等级、临床诊断、教师绩效评价或因果证明。',
  }
}
