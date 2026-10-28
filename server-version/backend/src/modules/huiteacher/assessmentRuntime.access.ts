import {EducationAssessmentSourceError} from '../education-tools/assessment-resource.repository'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {loadFrozenActiveSlot,compositeItemSlotKey,formSectionSlotKey} from '../assessment-runtime/slot-set'
import {currentRunPopulationAuthoritySql} from '../assessment-run/currentPopulationAuthority'
import {boundCompositeContinuationSql} from '../assessment-run/boundCompositeContinuation'
import {relationalEntryToRunPolicy,type RunResourcePolicy} from '../assessment-run/resourceAuthority'
import type {RelationalProductEntryV1} from '../assessment-relational/product-registry'
import {educationAssessmentOriginSchema,educationAssessmentResourceKey,type EducationAssessmentOrigin} from '../education-tools/assessment-resource.contract'
import {readFrozenCompositionIdentity,assertCompositionCollection} from '../assessment-run/educationCompositionExecution'
import {EducationPrivateToolError} from '../education-tools/private-tool.contracts'

export type TeacherRuntimeDb=Prisma.TransactionClient
export type TeacherSourceIdentity={origin:EducationAssessmentOrigin;entry:RelationalProductEntryV1;identityOnly:true}
export type TeacherRuntimePurpose='START'|'BOUND_COLLECTION'|'HISTORY_READ'
/** Required integration port. Reading a registered identity does not grant use.
 * Root must also enforce this contract within shared START/FINAL transactions. */
export type TeacherAssessmentSourceAccess<Identity extends TeacherSourceIdentity=TeacherSourceIdentity>={
 readIdentity:(db:TeacherRuntimeDb,input:{resourceKey:string;version:string;purpose:'NEW_USE'|'HISTORY'})=>Promise<Identity>
 assertUse:(db:TeacherRuntimeDb,input:{identity:Identity;executionId:string;actorUserId:string;purpose:TeacherRuntimePurpose})=>Promise<void>
}
export class TeacherAssessmentRuntimeError extends Error{
 constructor(public readonly code='HUITEACHER_ASSESSMENT_UNAVAILABLE',public readonly statusCode=404){super('当前教师测评任务不可访问');this.name='TeacherAssessmentRuntimeError'}
}
const fail=():never=>{throw new TeacherAssessmentRuntimeError()}
export type TeacherAssessmentTask={
 executionId:string;organizationId:string;runId:string;eventId:string;eventTitle:string;title:string;
 family:'COGNITIVE'|'SITUATIONAL'|'BUNDLE';status:'ASSIGNED'|'STARTED'|'COMPLETED';runStatus:string;
 runtimeBindingRef:string|null;consentRequired:boolean;consentPurpose:string|null;consentVisibility:string|null
}
type Row=Omit<TeacherAssessmentTask,'title'>&{
 resourceKey:string;resourceVersion:string;policy:RunResourcePolicy;policyHash:string;
 assignmentId:string;episodeId:string;bindingKind:string|null;cursorCreatedAt:string;
 attemptEpoch:number|null;frozenSlotSet:string|null;frozenSlotSetHash:string|null
}
const uuid=z.string().guid()
const cursorSchema=z.object({v:z.literal(1),actorUserId:uuid,createdAt:z.string().datetime({precision:6}),executionId:uuid}).strict()
const pageSchema=z.object({cursor:z.string().min(1).max(1024).optional(),pageSize:z.coerce.number().int().min(1).max(100).default(50)}).strict()
type Cursor=z.infer<typeof cursorSchema>
function decodeCursor(value:string,actorUserId:string):Cursor{
 try{
  const bytes=Buffer.from(value,'base64url')
  if(bytes.toString('base64url')!==value)fail()
  const cursor=cursorSchema.parse(JSON.parse(bytes.toString('utf8')))
  if(cursor.actorUserId!==actorUserId)fail()
  return cursor
 }catch{throw new TeacherAssessmentRuntimeError('HUITEACHER_ASSESSMENT_CURSOR_INVALID',400)}
}
/** Product identity, current account/persona/entitlement, exact SELF assignment,
 * event, Run and durable parent binding are predicates on actual database rows. */
export async function queryTeacherAssessmentRows(db:TeacherRuntimeDb,actorUserId:string,input:{executionId?:string;attemptId?:string;cursor?:Cursor;limit:number}){
 return db.$queryRaw<Row[]>(Prisma.sql`
 SELECT e.id AS "executionId",e.organization_id AS "organizationId",e.run_id AS "runId",event.id AS "eventId",
  event.title AS "eventTitle",t.resource_family AS family,e.status,r.status AS "runStatus",e.runtime_binding_ref AS "runtimeBindingRef",
  t.resource_key AS "resourceKey",t.resource_version AS "resourceVersion",t.frozen_resource_policy AS policy,t.resource_policy_hash AS "policyHash",
  a.id AS "assignmentId",a.episode_id AS "episodeId",e.runtime_binding_kind AS "bindingKind",
  parent.attempt_epoch AS "attemptEpoch",parent.frozen_active_slot_set_encrypted AS "frozenSlotSet",parent.frozen_active_slot_set_hash AS "frozenSlotSetHash",
  (a.consent_id IS NOT NULL) AS "consentRequired",consent.purpose AS "consentPurpose",consent.visibility_scope AS "consentVisibility",
  to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorCreatedAt"
 FROM assessment_run_executions e
 JOIN organizations org ON org.id=e.organization_id AND org.product_domain='SCHOOL' AND org.status='ACTIVE'
 JOIN education_product_entitlements entitlement ON entitlement.organization_id=e.organization_id
  AND entitlement.product='HUITEACHER' AND entitlement.status='ACTIVE'
 JOIN assessment_runs r ON r.id=e.run_id AND r.organization_id=e.organization_id
 JOIN assessment_run_tracks t ON t.id=e.track_id AND t.organization_id=e.organization_id AND t.run_id=e.run_id
 JOIN huiteacher_evaluation_run_links link ON link.organization_id=e.organization_id AND link.run_id=e.run_id
 JOIN huiteacher_evaluation_events event ON event.id=link.event_id AND event.organization_id=link.organization_id
 JOIN users actual_teacher ON actual_teacher.id=${actorUserId} AND actual_teacher.account_domain='SCHOOL'
  AND actual_teacher.role IN ('TEACHER','ADMIN') AND actual_teacher.teacher_approved=TRUE
  AND actual_teacher.is_active=TRUE AND actual_teacher.is_frozen=FALSE AND actual_teacher.must_change_password=FALSE
  AND (actual_teacher.expires_at IS NULL OR actual_teacher.expires_at>statement_timestamp())
 JOIN assessment_run_actor_snapshots subject ON subject.id=e.subject_actor_snapshot_id
  AND subject.organization_id=e.organization_id AND subject.run_id=e.run_id AND subject.user_id=${actorUserId} AND subject.actor_role='TEACHER'
 JOIN assessment_run_actor_snapshots respondent ON respondent.id=e.respondent_actor_snapshot_id
  AND respondent.organization_id=e.organization_id AND respondent.run_id=e.run_id AND respondent.user_id=${actorUserId} AND respondent.actor_role='TEACHER'
 JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id AND a.policy_domain='ORGANIZATION_RUN'
  AND a.resource_kind=t.resource_family AND a.resource_key=t.resource_key AND a.resource_version=t.resource_version
  AND a.respondent_user_id=${actorUserId} AND a.subject_user_id=${actorUserId}
  AND a.respondent_role='TEACHER' AND a.subject_role='TEACHER' AND a.relationship_kind='SELF' AND a.perspective='SELF_REPORT'
  AND a.analysis_mode='INDIVIDUAL_ONLY' AND a.minimum_respondents IS NULL
 LEFT JOIN assessment_attempt_consents consent ON consent.id=a.consent_id
 LEFT JOIN composite_assessment_attempts parent ON parent.id=e.runtime_binding_ref AND e.runtime_binding_kind='COMPOSITE'
  AND parent.assignment_ref=a.id AND parent.episode_id=a.episode_id
  AND parent.user_id=${actorUserId} AND parent.subject_user_id=${actorUserId} AND parent.respondent_user_id=${actorUserId}
  AND parent.composite_assessment_id=t.frozen_resource_policy->'runtimeLaunchTarget'->>'ref'
  AND parent.delivery_mode='FINAL_ONLY' AND parent.runtime_generation='UNIFIED_V1'
 WHERE t.resource_family IN ('COGNITIVE','SITUATIONAL','BUNDLE') AND t.resource_version='1.0.0'
  AND (t.resource_key LIKE 'education-assessment:TEACHER:%' OR t.resource_key LIKE 'education-composition:TEACHER:%')
  AND NOT EXISTS(SELECT 1 FROM campus_activity_runs school WHERE school.organization_id=e.organization_id AND school.run_id=e.run_id)
  AND ${currentRunPopulationAuthoritySql(Prisma.sql`e.id`)}
  AND ((e.status='ASSIGNED' AND a.status='OPEN' AND r.status='PUBLISHED' AND event.status='OPEN'
    AND e.runtime_binding_kind IS NULL AND e.runtime_binding_ref IS NULL)
   OR (e.status='STARTED' AND a.status='STARTED' AND parent.status='IN_PROGRESS' AND event.status='OPEN'
    AND ${boundCompositeContinuationSql(Prisma.sql`e.id`,actorUserId)} AND r.status IN ('PUBLISHED','CLOSED'))
   OR (e.status='COMPLETED' AND a.status='COMPLETED' AND parent.status='COMPLETED'
    AND r.status IN ('PUBLISHED','CLOSED') AND event.status IN ('OPEN','CLOSED')))
  ${input.executionId?Prisma.sql`AND e.id=${input.executionId}`:Prisma.empty}
  ${input.attemptId?Prisma.sql`AND e.runtime_binding_kind='COMPOSITE' AND parent.id=${input.attemptId}`:Prisma.empty}
  ${input.cursor?Prisma.sql`AND (e.created_at,e.id)<(${input.cursor.createdAt}::timestamptz,${input.cursor.executionId}::text)`:Prisma.empty}
 ORDER BY e.created_at DESC,e.id DESC LIMIT ${input.limit}`)
}
function taskDto(row:Row,title:string):TeacherAssessmentTask{
 const {executionId,organizationId,runId,eventId,eventTitle,family,status,runStatus,runtimeBindingRef,consentRequired,consentPurpose,consentVisibility}=row
 return {executionId,organizationId,runId,eventId,eventTitle,title,family,status,runStatus,runtimeBindingRef,consentRequired,consentPurpose,consentVisibility}
}
export function createTeacherAssessmentAccess<Identity extends TeacherSourceIdentity>(db:TeacherRuntimeDb,source:TeacherAssessmentSourceAccess<Identity>){
 const authorize=async(row:Row,actorUserId:string)=>{
  if(row.resourceKey.startsWith('education-composition:')){
   if(row.family!=='BUNDLE')fail()
   const identity=await readFrozenCompositionIdentity(db,{policy:row.policy,policyHash:row.policyHash,organizationId:row.organizationId,
    key:row.resourceKey,version:row.resourceVersion})
   if(identity.origin.entry!=='TEACHER')fail()
   if(row.status!=='COMPLETED')await assertCompositionCollection(db,identity,row.status==='ASSIGNED'?'NEW_START':'BOUND_COLLECTION')
   return {task:taskDto(row,identity.title),identity,row,runtimeCompositeId:identity.compositeId,
    units:identity.units.map(unit=>({itemId:unit.itemId,family:'SCALE' as const}))}
  }
  const identity=await source.readIdentity(db,{resourceKey:row.resourceKey,version:row.resourceVersion,purpose:row.status==='ASSIGNED'?'NEW_USE':'HISTORY'})
  const origin=educationAssessmentOriginSchema.parse(identity.origin),entry=identity.entry
  if(identity.identityOnly!==true||origin.product!=='TEACHER'||origin.organizationId!==row.organizationId
   ||origin.family!==row.family||row.resourceVersion!=='1.0.0'||educationAssessmentResourceKey(origin)!==row.resourceKey
   ||canonicalHash(row.policy)!==row.policyHash||canonicalHash(relationalEntryToRunPolicy(entry))!==row.policyHash
   ||entry.launchTarget?.runtime!=='COMPOSITE'||entry.launchTarget.compositeAssessmentId!==origin.runtimeCompositeId)fail()
  const a=entry.applicability
  if(a.resourceKey!==row.resourceKey||a.resourceVersion!==row.resourceVersion||a.resourceKind!==row.family
   ||a.subjectRoles.length!==1||a.subjectRoles[0]!=='TEACHER'||a.respondentRoles.length!==1||a.respondentRoles[0]!=='TEACHER'
   ||a.relationshipKinds.length!==1||a.relationshipKinds[0]!=='SELF'||a.perspectives.length!==1||a.perspectives[0]!=='SELF_REPORT'
   ||a.analysisMode!=='INDIVIDUAL_ONLY'||a.minimumRespondents!==null)fail()
  const purpose:TeacherRuntimePurpose=row.status==='ASSIGNED'?'START':row.status==='COMPLETED'?'HISTORY_READ':'BOUND_COLLECTION'
  await source.assertUse(db,{identity,executionId:row.executionId,actorUserId,purpose})
  return {task:taskDto(row,entry.title),identity,row,runtimeCompositeId:origin.runtimeCompositeId,units:origin.units}
 }
 const own=async(actorUserId:string,input:{executionId?:string;attemptId?:string})=>{
  if(!input.executionId&&!input.attemptId)fail()
  const rows=await queryTeacherAssessmentRows(db,actorUserId,{...input,limit:2})
  if(rows.length!==1)fail()
  return authorize(rows[0],actorUserId)
 }
 return {
  own,
  async page(actorUserId:string,raw:unknown={}){
   const input=pageSchema.parse(raw),cursor=input.cursor?decodeCursor(input.cursor,actorUserId):undefined
   const rows=await queryTeacherAssessmentRows(db,actorUserId,{cursor,limit:input.pageSize+1})
   const page=rows.slice(0,input.pageSize),list:TeacherAssessmentTask[]=[]
   for(const row of page){
    try{list.push((await authorize(row,actorUserId)).task)}catch(error){
     if(error instanceof EducationAssessmentSourceError&&['EDUCATION_ASSESSMENT_RESOURCE_NOT_AVAILABLE','EDUCATION_ASSESSMENT_ORIGINAL_ISSUER_REVOKED'].includes(error.code))continue
     if(error instanceof ContentAuthorityError&&error.code==='CONTENT_AUTHORITY_DENIED')continue
     if(error instanceof EducationPrivateToolError&&['PRIVATE_COMPOSITION_COLLECTION_UNAVAILABLE','PRIVATE_TOOL_AUTHOR_REQUIRED'].includes(error.code))continue
     throw error
    }
   }
   const last=page[page.length-1]
   return {list,nextCursor:rows.length>input.pageSize&&last?Buffer.from(JSON.stringify({v:1,actorUserId,createdAt:last.cursorCreatedAt,executionId:last.executionId} satisfies Cursor)).toString('base64url'):null}
  },
  async child(actorUserId:string,input:{attemptId:string;itemId:string;sessionId?:string;situationalAttemptId?:string;type:'COGNITIVE'|'SITUATIONAL'|'SCALE'|'FORM_SECTION'}){
   const proof=await own(actorUserId,{attemptId:input.attemptId})
   const expected=input.type==='SITUATIONAL'?'SJT':input.type
   if(input.type!=='FORM_SECTION'&&!proof.units.some(unit=>unit.itemId===input.itemId&&unit.family===expected))fail()
   const rows=await db.$queryRaw<Array<{id:string;compiledRuntimeHash:string|null;definitionHash:string|null}>>(Prisma.sql`
    SELECT slot.id,
     ${input.type==='COGNITIVE'?Prisma.sql`(SELECT child.compiled_runtime_hash FROM cognitive_sessions child WHERE child.id=${input.sessionId??''})`
      :input.type==='SITUATIONAL'?Prisma.sql`(SELECT child.compiled_runtime_hash FROM situational_attempts child WHERE child.id=${input.situationalAttemptId??''})`:Prisma.sql`NULL`} AS "compiledRuntimeHash",
     ${input.type==='SITUATIONAL'?Prisma.sql`(SELECT child.definition_hash FROM situational_attempts child WHERE child.id=${input.situationalAttemptId??''})`:Prisma.sql`NULL`} AS "definitionHash"
    FROM composite_assessment_attempts parent
    JOIN composite_assessment_items slot ON slot.composite_assessment_id=parent.composite_assessment_id
    WHERE parent.id=${input.attemptId} AND parent.user_id=${actorUserId}
     AND parent.composite_assessment_id=${proof.runtimeCompositeId}
     AND ${input.type==='FORM_SECTION'?Prisma.sql`slot.form_section_id=${input.itemId} AND slot.type='FORM'`:Prisma.sql`slot.id=${input.itemId} AND slot.type::text=${input.type}`}
     ${input.type==='COGNITIVE'?Prisma.sql`AND EXISTS(SELECT 1 FROM cognitive_sessions child
      WHERE child.id=${input.sessionId??''} AND child.composite_attempt_id=parent.id AND child.composite_item_id=slot.id
       AND child.assignment_id=slot.cognitive_assignment_id AND child.user_id=${actorUserId} AND child.attempt_no=parent.attempt_epoch
       AND child.delivery_mode='FINAL_ONLY' AND child.runtime_generation='UNIFIED_V1')`:Prisma.empty}
     ${input.type==='SITUATIONAL'?Prisma.sql`AND EXISTS(SELECT 1 FROM situational_attempts child
      WHERE child.id=${input.situationalAttemptId??''} AND child.composite_attempt_id=parent.id AND child.composite_item_id=slot.id
       AND child.composite_slot_key='situational:'||slot.id AND child.user_id=${actorUserId} AND child.attempt_epoch=parent.attempt_epoch
       AND child.instrument_key=slot.situational_instrument_key AND child.instrument_version=slot.situational_instrument_version
       AND child.delivery_mode='FINAL_ONLY' AND child.runtime_generation='UNIFIED_V1')`:Prisma.empty}
    LIMIT 1`)
   if(rows.length!==1)fail()
   // The same template item can have historical child rows. Membership alone
   // cannot select a different epoch or runtime than the parent's frozen plan.
   const slot=await loadFrozenActiveSlot({encrypted:proof.row.frozenSlotSet,storedHash:proof.row.frozenSlotSetHash,
    attemptEpoch:proof.row.attemptEpoch??0,slotKey:input.type==='FORM_SECTION'?formSectionSlotKey(input.itemId):compositeItemSlotKey(input.itemId,input.type)},db).catch(()=>fail())
   if(slot.unitType!==input.type||(input.type==='FORM_SECTION'?slot.sourceBinding.sectionId:slot.sourceBinding.compositeItemId)!==input.itemId)fail()
   if((input.type==='COGNITIVE'||input.type==='SITUATIONAL')&&(!rows[0].compiledRuntimeHash||slot.sourceBinding.compiledRuntimeHash!==rows[0].compiledRuntimeHash))fail()
   if(input.type==='SITUATIONAL'&&(!slot.runtimeIdentity||slot.runtimeIdentity.definitionHash!==rows[0].definitionHash
    ||slot.runtimeIdentity.compiledRuntimeHash!==rows[0].compiledRuntimeHash))fail()
   return proof
  },
 }
}
