import type { ScaleDefinitionV2 } from '../scale/scale-definition'

/** Teacher Pilot content is intentionally narrower than a licensed standard
 * instrument. Authored report text, source rights and scoring MUST remain
 * inside hashScaleDefinition's complete immutable digest. VersionAxes hashes
 * exclude report/license for other pathways, so that variant is not eligible
 * for this narrowly scoped pilot; a future independent QC registry can widen.
 */
export function teacherPilotContentIssues(definition:ScaleDefinitionV2):string[]{
  const issues:string[]=[]
  if(definition.respondentType!=='teacher_self_report')issues.push('TEACHER_RESPONDENT_REQUIRED')
  if(definition.versionAxes)issues.push('TEACHER_FULL_REPORT_HASH_REQUIRED')
  if(definition.license.status!=='self_authored'
    ||definition.license.redistribution!=='allowed')issues.push('TEACHER_LICENSE_REQUIRED')
  if(definition.referencePolicy.type!=='none')issues.push('TEACHER_PILOT_REFERENCE_FORBIDDEN')
  if(definition.display.randomizeItems||definition.items.some(i=>i.randomizeOptions))
    issues.push('TEACHER_PILOT_FIXED_PRESENTATION_REQUIRED')
  if(definition.items.some(i=>Boolean(i.images)||Boolean(i.video)))
    issues.push('TEACHER_EXTERNAL_MEDIA_NOT_LICENSED')
  const c=definition.report.audienceContract
  if(!c||c.schemaVersion!==1||c.respondent!=='ADULT_SELF'
    ||c.audience!=='teacher'||c.locale!=='zh-CN'
    ||!c.qcReview?.reviewer.trim()||!c.qcReview.basis.trim()
    ||!Number.isFinite(Date.parse(c.qcReview.reviewedAt)))
    issues.push('TEACHER_ADULT_REPORT_QC_REQUIRED')
  for(const key of definition.report.primaryScoreKeys){
    const report=definition.report.interpretations.filter(i=>
      i.scoreKey===key&&i.source.type==='score_only')
    if(report.length!==1||report[0].bands.length>0
      ||report[0].summary.trim().length<100
      ||!report[0].guidance.some(g=>g.category==='reflection')
      ||!report[0].guidance.some(g=>['strategy','support'].includes(g.category)))
      issues.push('TEACHER_REPORT_TEXT_AND_ACTION_REQUIRED:'+key)
  }
  return issues
}
