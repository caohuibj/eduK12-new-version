import {catalogDiscoveryRecords,discoveryJoin,discoverySqlFilter,discoveryFacets,sjtMetadataTagIds} from '../survey/catalog-discovery'
import type {CatalogDiscoveryFilters,CatalogClassificationTag} from '../scale/library/catalog-discovery'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import type {AuthenticatedPrincipal} from '../../types'
import {readEducationRunLibraryContext} from '../assessment-run/educationLibraryContext'
import {assertCurrentRunManagerBoundary} from '../assessment-run/resourceBoundary'
import {relationalEntryToRunPolicy,productionRunResourceAuthorityRegistry} from '../assessment-run/resourceAuthority'
import {lockAndAssertCampusActivityEditor} from '../campus/activity.service'
import {assertEducationAssessmentRunUse} from './assessment-resource.authority'
import {EducationAssessmentSourceError} from './assessment-resource.repository'

export class EducationAssessmentCatalogError extends Error{
 constructor(readonly code:string,readonly statusCode=409){super(code);this.name='EducationAssessmentCatalogError'}
}
export type EducationAssessmentCatalogInput={
 product:'SCHOOL'|'TEACHER';organizationId:string;workflowId:string;runId:string
 expectedVersion:number;actor:AuthenticatedPrincipal;cursor?:string
}&CatalogDiscoveryFilters
const deny=(code:string,status=409):never=>{throw new EducationAssessmentCatalogError(code,status)}
const unavailableCodes=new Set(['EDUCATION_ASSESSMENT_RESOURCE_NOT_AVAILABLE','EDUCATION_ASSESSMENT_ORIGINAL_ISSUER_REVOKED'])

/** A bounded current-use directory. Never return source definitions, original
 * content bytes, runtime ids or original authority proofs to management UI.
 * A raw identity reader is deliberately insufficient: every row passes the
 * current workflow/actor/original-issuer authority service in this transaction.
 */
export async function listEducationAssessmentResources(input:EducationAssessmentCatalogInput){
 if(input.actor.accountDomain!=='SCHOOL')deny('EDUCATION_ASSESSMENT_CATALOG_ACCOUNT_REQUIRED',403)
 return prisma.$transaction(async tx=>{
  const context=await readEducationRunLibraryContext(tx,input)
  if(!context||context.product!==input.product
   ||(input.product==='TEACHER'?context.teacherEventId:context.schoolCourseId)!==input.workflowId)
   deny('EDUCATION_ASSESSMENT_CATALOG_WORKFLOW_MISMATCH',404)
  // Keep Organization before Activity/source locks, matching edit/publication.
  await tx.$queryRaw(Prisma.sql`SELECT id FROM organizations WHERE id=${input.organizationId} FOR SHARE`)
  await assertCurrentRunManagerBoundary({...input,actorUserId:input.actor.userId},tx)
  // Preserve School's activity-editor capability independently of Run ownership.
  if(input.product==='SCHOOL'){
   const {activity}=await lockAndAssertCampusActivityEditor(tx,{actor:input.actor,organizationId:input.organizationId,courseId:input.workflowId})
   if(activity.status!=='DRAFT')deny('EDUCATION_ASSESSMENT_CATALOG_NOT_DRAFT')
  }
  const [run]=input.product==='TEACHER'
   ?await tx.$queryRaw<Array<{version:number;status:string;workflowStatus:string}>>(Prisma.sql`
    SELECT r.version,r.status,e.status AS "workflowStatus" FROM assessment_runs r
    JOIN huiteacher_evaluation_run_links l ON l.run_id=r.id AND l.organization_id=r.organization_id
    JOIN huiteacher_evaluation_events e ON e.id=l.event_id AND e.organization_id=l.organization_id
    WHERE r.id=${input.runId} AND r.organization_id=${input.organizationId} AND e.id=${input.workflowId}`)
   :await tx.$queryRaw<Array<{version:number;status:string;workflowStatus:string}>>(Prisma.sql`
    SELECT r.version,r.status,a.status AS "workflowStatus" FROM assessment_runs r
    JOIN campus_activity_runs l ON l.run_id=r.id AND l.organization_id=r.organization_id
    JOIN campus_activities a ON a.course_id=l.course_id AND a.organization_id=l.organization_id
    WHERE r.id=${input.runId} AND r.organization_id=${input.organizationId} AND a.course_id=${input.workflowId}`)
  if(!run)deny('EDUCATION_ASSESSMENT_CATALOG_RUN_NOT_FOUND',404)
  if(run.status!=='DRAFT'||run.workflowStatus!=='DRAFT')deny('EDUCATION_ASSESSMENT_CATALOG_NOT_DRAFT')
  if(run.version!==input.expectedVersion)deny('RUN_VERSION_CONFLICT')
  if(input.product==='TEACHER'&&await tx.huiteacherStudentEvaluationConfig.findUnique({where:{
   organizationId_eventId:{organizationId:input.organizationId,eventId:input.workflowId}},select:{id:true}}))
   deny('HUITEACHER_STUDENT_EVAL_TRACK_READONLY',403)
  const records=catalogDiscoveryRecords()
  const rows=await tx.$queryRaw<Array<{id:string;family:'COGNITIVE'|'SITUATIONAL'|'BUNDLE';version:string;classificationTags:CatalogClassificationTag[]}>>(Prisma.sql`
   SELECT discovery.tags AS "classificationTags",delivery.id,delivery.family,delivery.entry->'educationOrigin'->>'adapterVersion' AS version FROM education_assessment_deliveries delivery
   LEFT JOIN composite_assessments source ON source.id=delivery.source_composite_id
   LEFT JOIN measurement_content_releases measurement ON delivery.family<>'BUNDLE' AND measurement.id=delivery.entry#>>'{educationOrigin,units,0,measurement,releaseId}'
   ${discoveryJoin(records,{kind:Prisma.sql`CASE WHEN delivery.family='COGNITIVE' THEN 'COGNITIVE' ELSE NULL END`,key:Prisma.sql`measurement.content#>>'{executable,testType}'`,version:Prisma.sql`NULL`,engine:Prisma.sql`measurement.content#>>'{executable,engineVersion}'`,scoring:Prisma.sql`measurement.content#>>'{executable,scoringVersion}'`},Prisma.sql`COALESCE(to_jsonb(source.tags),'[]'::jsonb)||CASE WHEN delivery.family='SITUATIONAL' THEN ${sjtMetadataTagIds(Prisma.sql`measurement.content->'executable'`)} ELSE '[]'::jsonb END`)}
   WHERE delivery.product=${input.product} AND delivery.organization_id=${input.organizationId} AND delivery.status='PUBLISHED'
    AND ${discoverySqlFilter([Prisma.sql`delivery.entry->>'title'`],input)}
    ${input.cursor?Prisma.sql`AND delivery.id>${input.cursor}`:Prisma.empty}
   ORDER BY delivery.id LIMIT 11`)
  const list=[]
  let unavailableCount=0
  for(const row of rows.slice(0,10)){
   const resource={family:row.family,key:`education-assessment:${input.product}:${input.organizationId}:${row.id}`,version:row.version}
   try{
    const source=await assertEducationAssessmentRunUse(tx,{actorUserId:input.actor.userId,organizationId:input.organizationId,runId:input.runId,resource})
    productionRunResourceAuthorityRegistry.assertStartSupported(resource.family)
    const policy=relationalEntryToRunPolicy(source.entry)
    list.push({title:source.entry.title,classificationTags:row.classificationTags,...resource,product:input.product,organizationId:input.organizationId,
     releaseStatus:'PUBLISHED' as const,availability:'AVAILABLE' as const,educationOriginHash:source.entry.educationOriginHash,
     units:source.origin.units,requestedPolicy:{subjectRoles:[...policy.subjectRoles],respondentRoles:[...policy.respondentRoles],
      relationshipKinds:[...policy.relationshipKinds],perspectives:[...policy.perspectives],analysisMode:policy.analysisMode,
      visibilityPolicyKey:policy.visibilityPolicyKey,minimumRespondents:policy.minimumRespondents}})
   }catch(error){
    // Explicit business refusals may consume a bounded page. Unknown failures,
    // database/transport errors and identity corruption must not become empty.
    if(error instanceof EducationAssessmentSourceError&&unavailableCodes.has(error.code)){unavailableCount++;continue}
    const known=error as {code?:string}
    if(known?.code==='RUN_START_ADAPTER_UNAVAILABLE'){unavailableCount++;continue}
    throw error
   }
  }
  return {scope:{product:input.product,organizationId:input.organizationId,workflowId:input.workflowId,runId:input.runId,expectedVersion:run.version},
   list,tagFacets:discoveryFacets(records),nextCursor:rows.length>10?rows[9].id:null,unavailableCount}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
