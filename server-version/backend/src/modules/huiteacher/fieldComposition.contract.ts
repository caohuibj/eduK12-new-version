import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {educationCompositionOriginSchema,educationCompositionKey,educationCompositionRuntimeAnchorSchema} from '../education-tools/private-tool.composition-contracts'

export const fieldAssessmentRefSchema=z.object({schemaVersion:z.literal(1),kind:z.literal('COMPOSITION'),compositeId:z.string().guid(),resourceKey:z.string(),
 resourceVersion:z.literal('2.0.0'),manifestHash:z.string().regex(/^[a-f0-9]{64}$/),origin:educationCompositionOriginSchema}).strict().superRefine((value,ctx)=>{
 if(value.origin.variantKey!=='TEACHER:EXPERT_REPORT'||value.origin.adapterVersion!=='2.0.0'||value.origin.entry!=='TEACHER'
  ||value.resourceKey!==educationCompositionKey(value.origin))ctx.addIssue({code:'custom',message:'现场观察必须绑定明确专家适用的固定问卷'})
})
export type FieldAssessmentRef=z.infer<typeof fieldAssessmentRefSchema>
export const isFieldCompositionKey=(key:string|null|undefined)=>Boolean(key&&/^education-composition:TEACHER:[a-f0-9-]{36}:TEACHER:EXPERT_REPORT:2\.0\.0$/.test(key))
export type FieldAttemptIdentity={organizationId:string;eventId:string;targetId:string;invitationId:string;acceptedAt:string;assessmentRef:FieldAssessmentRef;subjectUserId:string|null;respondentUserId:string}
/** Stable per accepted invitation generation and exact immutable source. An
 * expiry extension cannot replace answers; a new acceptance cannot borrow them. */
export const fieldParticipantKey=(scope:FieldAttemptIdentity)=>'field-v2:'+canonicalHash({organizationId:scope.organizationId,eventId:scope.eventId,targetId:scope.targetId,
 invitationId:scope.invitationId,acceptedAt:scope.acceptedAt,compositeId:scope.assessmentRef.compositeId,versionId:scope.assessmentRef.origin.versionId,contentHash:scope.assessmentRef.origin.contentHash})
export const fieldCompositionBinding=(ref:FieldAssessmentRef)=>({...educationCompositionRuntimeAnchorSchema.parse({origin:ref.origin,manifestHash:ref.manifestHash}),unitReports:[]})

export interface VerifiedFieldStart {readonly kind:'VERIFIED_FIELD_START'}
type Proof=FieldAttemptIdentity&{tx:object;participantKey:string}
const starts=new WeakMap<object,Proof>()
export function issueVerifiedFieldStart(scope:FieldAttemptIdentity&{tx:object}):VerifiedFieldStart{
 const ref=fieldAssessmentRefSchema.parse(scope.assessmentRef)
 if(!scope.invitationId||!scope.respondentUserId||scope.subjectUserId===scope.respondentUserId
  ||(ref.origin.targetKind==='PERSON')!==(scope.subjectUserId!==null))throw Error('FIELD_START_IDENTITY_INVALID')
 const proof=Object.freeze({kind:'VERIFIED_FIELD_START' as const})
 starts.set(proof,{...scope,assessmentRef:ref,participantKey:fieldParticipantKey(scope)})
 return proof
}
export function readVerifiedFieldStart(proof:VerifiedFieldStart,expected:{tx:object;compositeId:string;respondentUserId:string}){
 const value=proof&&starts.get(proof)
 if(!value||value.tx!==expected.tx||value.assessmentRef.compositeId!==expected.compositeId||value.respondentUserId!==expected.respondentUserId)
  throw Error('FIELD_START_IDENTITY_INVALID')
 return value
}
