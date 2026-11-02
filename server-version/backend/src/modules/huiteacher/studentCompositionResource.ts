import {Prisma} from '@prisma/client'
import type {RunResourceRef,RunTrackNarrowingRequest} from '../assessment-run/resourceAuthority'
import {canonicalHash} from '../assessment-runtime/canonical'
import {privateToolFail} from '../education-tools/private-tool.contracts'
import {isStudentCompositionKey,STUDENT_COMPOSITION_POLICY} from './studentComposition.policy'
import {teacherResourceMinimum} from './privacyV2'
import type {FormDraft} from '../assessment-core/form/definition'

export const studentCompositionRef=(versionId:string):RunResourceRef=>({family:'BUNDLE',key:`education-composition:TEACHER:${versionId}:TEACHER:STUDENT_REPORT:1.0.0`,version:'1.0.0'})
// Report-only switches must not create a new population comparison identity.
export const studentFormComparableKey=(definition:FormDraft)=>{
 const {descriptive:_reportConfig,...content}=definition
 return 'FORM:'+canonicalHash({kind:'FORM',definition:content})
}
export type StudentEvaluationSourceConfig={formId:string|null;definitionDigest:string|null;compositionVersionId:string|null;compositionContentHash:string|null}
export function studentEvaluationConfigMatches(config:StudentEvaluationSourceConfig,ref:{family:string;key:string;version:string;contentHash?:string}){
 return config.compositionVersionId!==null
  ?ref.family==='BUNDLE'&&ref.key===studentCompositionRef(config.compositionVersionId).key&&ref.version==='1.0.0'&&ref.contentHash===config.compositionContentHash
  :ref.family==='FORM'&&ref.key==='huiteacher-student-form:'+config.formId&&ref.version===config.definitionDigest
}
/** Both source alternatives bind the exact immutable configuration. Current
 * relationship, account and entitlement predicates stay with the caller. */
export function studentEvaluationTrackConfigSql(track:Prisma.Sql,config:Prisma.Sql){
 return Prisma.sql`((${config}.composition_version_id IS NULL AND ${track}.resource_family='FORM'
   AND ${track}.resource_key='huiteacher-student-form:'||${config}.form_id AND ${track}.resource_version=${config}.definition_digest)
  OR (${config}.composition_version_id IS NOT NULL AND ${track}.resource_family='BUNDLE' AND ${track}.resource_version='1.0.0'
   AND ${track}.resource_key='education-composition:TEACHER:'||${config}.composition_version_id||':TEACHER:STUDENT_REPORT:1.0.0'
   AND ${track}.frozen_resource_policy#>>'{educationComposition,origin,contentHash}'=${config}.composition_content_hash))`
}
export function studentCompositionRequestedPolicy(teacherMembershipId:string):RunTrackNarrowingRequest{
 return {subjectRoles:['TEACHER'],respondentRoles:['STUDENT'],relationshipKinds:['CLASS_TEACHER_STUDENT'],perspectives:['OBSERVER_REPORT'],
  analysisMode:'COHORT_AGGREGATE',visibilityPolicyKey:STUDENT_COMPOSITION_POLICY,minimumRespondents:teacherResourceMinimum(),
  targetPolicy:{mode:'SELECTED_CLASS_TEACHERS',teacherMembershipIds:[teacherMembershipId]}}
}
/** Exact config-bound internal use only. This is deliberately separate from
 * the generic private-tool workflow, which still refuses student campaigns. */
export async function assertStudentCompositionRunUse(tx:Prisma.TransactionClient,input:{organizationId:string;runId:string;actorUserId:string;ref:RunResourceRef}){
 if(!isStudentCompositionKey(input.ref.key)||input.ref.family!=='BUNDLE'||input.ref.version!=='1.0.0')privateToolFail('HUITEACHER_STUDENT_COMPOSITION_REQUIRED',403)
 const rows=await tx.$queryRaw<Array<{id:string;eventId:string;classUnitId:string;staffAssignmentId:string;teacherMembershipId:string;teacherUserId:string;versionId:string;contentHash:string}>>(Prisma.sql`
  SELECT cfg.id,cfg.event_id AS "eventId",cfg.class_unit_id AS "classUnitId",cfg.staff_assignment_id AS "staffAssignmentId",
   teacher.id AS "teacherMembershipId",teacher.user_id AS "teacherUserId",cfg.composition_version_id AS "versionId",cfg.composition_content_hash AS "contentHash"
  FROM huiteacher_student_eval_configs cfg JOIN huiteacher_evaluation_run_links link ON link.organization_id=cfg.organization_id AND link.event_id=cfg.event_id
  JOIN huiteacher_evaluation_events event ON event.id=cfg.event_id AND event.organization_id=cfg.organization_id AND event.kind='ASSESSMENT' AND event.status IN ('DRAFT','OPEN')
  JOIN huiteacher_evaluation_targets target ON target.id=event.target_id AND target.organization_id=event.organization_id AND target.kind='PERSON' AND target.status='ACTIVE'
  JOIN organization_staff_class_assignments staff ON staff.id=cfg.staff_assignment_id AND staff.organization_id=cfg.organization_id AND staff.class_unit_id=cfg.class_unit_id
   AND staff.staff_role IN ('TEACHING','HOMEROOM') AND staff.valid_from<=statement_timestamp() AND (staff.valid_until IS NULL OR staff.valid_until>statement_timestamp())
  JOIN organization_memberships teacher ON teacher.id=staff.membership_id AND teacher.organization_id=staff.organization_id AND teacher.user_id=target.subject_user_id
   AND teacher.valid_from<=statement_timestamp() AND (teacher.valid_until IS NULL OR teacher.valid_until>statement_timestamp())
  JOIN organization_persona_grants persona ON persona.organization_id=teacher.organization_id AND persona.membership_id=teacher.id AND persona.persona='TEACHER' AND persona.revoked_at IS NULL
  JOIN education_private_tool_versions v ON v.id=cfg.composition_version_id AND v.content_hash=cfg.composition_content_hash AND v.kind='COMPOSITION' AND v.entry='TEACHER'
   AND v.organization_id=cfg.organization_id AND v.owner_user_id=cfg.configured_by_user_id AND v.owner_user_id=${input.actorUserId}
   AND v.definition#>>'{administration,population}'='TEACHER' AND v.definition#>>'{administration,responseMode}'='STUDENT_REPORT'
  WHERE cfg.organization_id=${input.organizationId} AND link.run_id=${input.runId}
   AND ${input.ref.key}='education-composition:TEACHER:'||v.id||':TEACHER:STUDENT_REPORT:1.0.0'`)
 if(rows.length!==1)privateToolFail('HUITEACHER_STUDENT_COMPOSITION_SCOPE_REQUIRED',403)
 return rows[0]
}
export function assertStudentCompositionSelection(input:{subjectSelector:unknown;respondentSelector:unknown;requestedPolicy:RunTrackNarrowingRequest},scope:{classUnitId:string;teacherMembershipId:string}){
 const selector={kind:'CLASS_UNITS',classUnitIds:[scope.classUnitId]}
 if(canonicalHash(input.subjectSelector)!==canonicalHash(selector)||canonicalHash(input.respondentSelector)!==canonicalHash(selector)
  ||canonicalHash(input.requestedPolicy)!==canonicalHash(studentCompositionRequestedPolicy(scope.teacherMembershipId)))
  privateToolFail('HUITEACHER_STUDENT_COMPOSITION_SELECTION_INVALID',403)
}
