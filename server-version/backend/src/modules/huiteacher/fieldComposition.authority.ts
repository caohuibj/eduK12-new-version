import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {educationCompositionOriginSchema,educationCompositionKey} from '../education-tools/private-tool.composition-contracts'
import {assertCompositionCollection} from '../assessment-run/educationCompositionExecution'
import {fieldAssessmentRefSchema,fieldParticipantKey,type FieldAssessmentRef,type FieldAttemptIdentity} from './fieldComposition.contract'

type Tx=Prisma.TransactionClient
export class FieldCompositionError extends Error{
 constructor(public readonly code='HUITEACHER_FIELD_QUESTIONNAIRE_UNAVAILABLE',public readonly statusCode=403){super(code);this.name='FieldCompositionError'}
}
export function fieldFail(code?:string,statusCode?:number):never{throw new FieldCompositionError(code,statusCode)}
export type FieldSource={ref:FieldAssessmentRef;title:string;status:string;manifest:Array<{sourceProvider:string;versionId:string;contentHash:string;kind:string;blockId:string;title?:string}>;
 units:Array<{scaleId:string;releaseId:string}>}
const sourceColumns=Prisma.sql`c.id AS "compositeId",c.creation_key AS "resourceKey",c.creation_hash AS "creationHash",c.created_by AS "createdBy",c.name AS title,c.status,
 c.training_content_snapshot_hash AS "manifestHash",c.training_content_snapshot#>'{educationBinding,origin}' AS origin,
 c.training_content_snapshot#>'{educationBinding,manifest}' AS manifest,
 (SELECT COALESCE(jsonb_agg(jsonb_build_object('scaleId',u#>>'{source,id}','releaseId',u#>>'{measurement,releaseId}')),'[]'::jsonb) FROM jsonb_array_elements(c.training_content_snapshot->'units') u) AS units`
type SourceRow={compositeId:string;resourceKey:string;creationHash:string;createdBy:string;manifestHash:string;origin:unknown;title:string;status:string;manifest:FieldSource['manifest'];units:FieldSource['units']}
function source(row:SourceRow):FieldSource{
 const origin=educationCompositionOriginSchema.parse(row.origin)
 const ref=fieldAssessmentRefSchema.parse({schemaVersion:1,kind:'COMPOSITION',compositeId:row.compositeId,resourceKey:row.resourceKey,
  resourceVersion:'2.0.0',manifestHash:row.manifestHash,origin})
 if(row.creationHash!==canonicalHash(origin)||row.createdBy!==origin.ownerUserId||row.resourceKey!==educationCompositionKey(origin)
  ||!Array.isArray(row.manifest)||!row.manifest.length||row.manifest.length>50||row.manifest.some(block=>block.sourceProvider!=='PRIVATE_VERSION')
  ||origin.targetKind!=='PERSON'&&row.manifest.some(block=>block.kind==='SCALE'))fieldFail('HUITEACHER_FIELD_SOURCE_INTEGRITY',409)
 return {ref,title:row.title,status:row.status,manifest:row.manifest,units:row.units}
}
/** Already-authorized local author. Reads only exact sealed metadata, not
 * scientific definitions, draft/latest versions or another author's library. */
export async function readFieldCompositionSource(tx:Tx,input:{organizationId:string;actorUserId:string;versionId:string;contentHash:string}){
 const rows=await tx.$queryRaw<SourceRow[]>(Prisma.sql`SELECT ${sourceColumns} FROM education_private_tool_versions v
  JOIN composite_assessments c ON c.creation_key='education-composition:TEACHER:'||v.id||':TEACHER:EXPERT_REPORT:2.0.0'
   AND c.product_kind='ORGANIZATION_RESOURCE' AND NOT c.public_enabled AND NOT c.copyable AND c.status IN ('DRAFT','PUBLISHED')
  WHERE v.id=${input.versionId} AND v.content_hash=${input.contentHash} AND v.kind='COMPOSITION' AND v.entry='TEACHER'
   AND v.organization_id=${input.organizationId} AND v.owner_user_id=${input.actorUserId}
   AND v.definition->>'schemaVersion'='2' AND v.definition->>'adapterVersion'='2.0.0'
   AND v.definition#>>'{administration,responseMode}'='EXPERT_REPORT'`)
 if(rows.length!==1)fieldFail('HUITEACHER_FIELD_FIXED_EXPERT_SOURCE_REQUIRED',409)
 return source(rows[0])
}
type CurrentRow=SourceRow&{organizationId:string;eventId:string;targetId:string;invitationId:string;acceptedAt:Date;targetKind:string;targetName:string;subjectUserId:string|null;
 assessmentRef:unknown;parentId:string|null;parentKey:string|null;parentSubject:string|null;parentRespondent:string|null;parentAssignment:string|null;parentEpoch:number|null;parentStatus:string|null}
type CurrentInput={actorUserId:string;invitationId?:string;attemptId?:string;eventId?:string;lock?:boolean;newStart?:boolean}
type CurrentField={scope:FieldAttemptIdentity;source:FieldSource;targetName:string;parent:{id:string;epoch:number;status:string}|null}
/** A field invitation is its own authority. No organization membership, SELF
 * assignment, class relationship or author privilege is inferred for experts. */
export function currentFieldComposition(tx:Tx,input:CurrentInput&{allowUnconfigured:true}):Promise<CurrentField|null>
export function currentFieldComposition(tx:Tx,input:CurrentInput&{allowUnconfigured?:false}):Promise<CurrentField>
export async function currentFieldComposition(tx:Tx,input:CurrentInput&{allowUnconfigured?:boolean}):Promise<CurrentField|null>{
 if(!input.invitationId&&!input.attemptId&&!input.eventId)fieldFail('HUITEACHER_FIELD_SCOPE_REQUIRED',400)
 const rows=await tx.$queryRaw<CurrentRow[]>(Prisma.sql`SELECT ${sourceColumns},grant_row.organization_id AS "organizationId",grant_row.event_id AS "eventId",target.id AS "targetId",
  grant_row.id AS "invitationId",grant_row.accepted_at AS "acceptedAt",target.kind AS "targetKind",target.name AS "targetName",target.subject_user_id AS "subjectUserId",
  binding.assessment_ref AS "assessmentRef",parent.id AS "parentId",parent.participant_key AS "parentKey",parent.subject_user_id AS "parentSubject",
  parent.respondent_user_id AS "parentRespondent",parent.assignment_ref AS "parentAssignment",parent.attempt_epoch AS "parentEpoch",parent.status AS "parentStatus"
  FROM huiteacher_observer_grants grant_row LEFT JOIN huiteacher_field_event_forms binding ON binding.organization_id=grant_row.organization_id AND binding.event_id=grant_row.event_id
  JOIN huiteacher_evaluation_events event ON event.id=grant_row.event_id AND event.organization_id=grant_row.organization_id AND event.status='OPEN'
   AND event.kind IN ('CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT')
  JOIN huiteacher_evaluation_targets target ON target.id=event.target_id AND target.organization_id=event.organization_id AND target.status='ACTIVE'
  JOIN organizations org ON org.id=event.organization_id AND org.product_domain='SCHOOL' AND org.status='ACTIVE'
  JOIN education_product_entitlements product ON product.organization_id=org.id AND product.product='HUITEACHER' AND product.status='ACTIVE'
  JOIN users actor ON actor.id=grant_row.observer_user_id AND actor.account_domain='SCHOOL' AND actor.role IN ('TEACHER','ADMIN')
   AND actor.teacher_approved AND actor.is_active AND NOT actor.is_frozen AND NOT actor.must_change_password AND (actor.expires_at IS NULL OR actor.expires_at>clock_timestamp())
  LEFT JOIN composite_assessments c ON c.id=binding.assessment_ref->>'compositeId' AND c.creation_key=binding.assessment_ref->>'resourceKey'
   AND c.training_content_snapshot_hash=binding.assessment_ref->>'manifestHash' AND c.product_kind='ORGANIZATION_RESOURCE' AND c.status='PUBLISHED'
   AND NOT c.public_enabled AND NOT c.copyable
  LEFT JOIN composite_assessment_attempts parent ON parent.id=${input.attemptId??''} AND parent.composite_assessment_id=c.id AND parent.user_id=actor.id
   AND parent.delivery_mode='FINAL_ONLY' AND parent.runtime_generation='UNIFIED_V1'
  WHERE grant_row.observer_user_id=${input.actorUserId} AND grant_row.role='EXPERT' AND grant_row.status='ACCEPTED'
   AND grant_row.accepted_at IS NOT NULL AND grant_row.revoked_at IS NULL AND grant_row.expires_at>clock_timestamp()
   ${input.invitationId?Prisma.sql`AND grant_row.id=${input.invitationId}`:input.attemptId?Prisma.sql`AND parent.id=${input.attemptId}`:Prisma.sql`AND event.id=${input.eventId}`}
   AND NOT EXISTS(SELECT 1 FROM organization_access_denies d WHERE d.organization_id=org.id AND d.user_id=actor.id AND d.lifted_at IS NULL AND d.permission IN ('*','EDUCATION_ACCESS','HUITEACHER_ACCESS','RUN_START'))
   AND (target.kind<>'PERSON' AND target.subject_user_id IS NULL OR target.kind='PERSON' AND target.subject_user_id<>actor.id AND EXISTS(
    SELECT 1 FROM organization_memberships m JOIN organization_persona_grants p ON p.organization_id=m.organization_id AND p.membership_id=m.id AND p.persona='TEACHER' AND p.revoked_at IS NULL
    JOIN users teacher ON teacher.id=m.user_id AND teacher.account_domain='SCHOOL' AND teacher.role IN ('TEACHER','ADMIN') AND teacher.teacher_approved
     AND teacher.is_active AND NOT teacher.is_frozen AND NOT teacher.must_change_password AND (teacher.expires_at IS NULL OR teacher.expires_at>clock_timestamp())
    WHERE m.organization_id=org.id AND m.user_id=target.subject_user_id AND m.valid_from<=clock_timestamp() AND (m.valid_until IS NULL OR m.valid_until>clock_timestamp())))
  ${input.lock?Prisma.sql`FOR SHARE OF grant_row,event,target,org,product`:Prisma.empty}`)
 if(rows.length!==1)fieldFail()
 if(!rows[0].assessmentRef){if(input.allowUnconfigured)return null;fieldFail('HUITEACHER_FIELD_FIXED_QUESTIONNAIRE_REQUIRED',409)}
 if(!rows[0].compositeId)fieldFail('HUITEACHER_FIELD_FIXED_SOURCE_UNAVAILABLE',409)
 const row=rows[0],fixed=source(row),ref=fieldAssessmentRefSchema.parse(row.assessmentRef)
 if(canonicalHash(ref)!==canonicalHash(fixed.ref)||ref.origin.organizationId!==row.organizationId||ref.origin.targetKind!==row.targetKind)fieldFail('HUITEACHER_FIELD_SCOPE_INTEGRITY',409)
 const scope:FieldAttemptIdentity={organizationId:row.organizationId,eventId:row.eventId,targetId:row.targetId,invitationId:row.invitationId,
  acceptedAt:row.acceptedAt.toISOString(),assessmentRef:ref,subjectUserId:row.subjectUserId,respondentUserId:input.actorUserId}
 if(input.attemptId&&(!row.parentId||row.parentKey!==fieldParticipantKey(scope)||row.parentSubject!==scope.subjectUserId
  ||row.parentRespondent!==scope.respondentUserId||row.parentAssignment!==null))fieldFail('HUITEACHER_FIELD_ATTEMPT_IDENTITY',409)
 await assertCompositionCollection(tx,{origin:ref.origin,manifest:fixed.manifest,units:fixed.units},input.newStart?'NEW_START':'BOUND_COLLECTION',!!input.lock)
 return {scope,source:fixed,targetName:row.targetName,parent:row.parentId?{id:row.parentId,epoch:row.parentEpoch!,status:row.parentStatus!}:null}
}
