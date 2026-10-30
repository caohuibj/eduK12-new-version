/** Server-only, transaction-bound proof issued after exact education START admission.
 * A serialized product hint cannot select the education SJT runtime path. */
export interface VerifiedEducationStart { readonly kind: 'VERIFIED_EDUCATION_START' }
type Facts={tx:object;product:'SCHOOL'|'TEACHER';compositeId:string;assignmentRef:string;subjectUserId?:string;respondentUserId:string;composition?:EducationCompositionPolicyBinding;longitudinal?:boolean}
const proofs=new WeakMap<object,Facts>()
export function issueVerifiedEducationStart(facts:Facts):VerifiedEducationStart {
 const origin=facts.composition?.origin
 const observer=origin&&(facts.product==='SCHOOL'&&origin.entry==='SCHOOL'
  &&['STUDENT:PARENT_REPORT','STUDENT:TEACHER_REPORT'].includes(origin.variantKey)
  ||facts.product==='TEACHER'&&origin.entry==='TEACHER'&&origin.variantKey==='TEACHER:STUDENT_REPORT')
 if(facts.subjectUserId!==undefined&&facts.subjectUserId!==facts.respondentUserId
  &&!observer)
  throw new Error('EDUCATION_START_CONTEXT_MISMATCH')
 const proof=Object.freeze({kind:'VERIFIED_EDUCATION_START' as const});proofs.set(proof,{...facts});return proof
}
export function readVerifiedEducationStart(proof:VerifiedEducationStart,expected:Omit<Facts,'product'>):Facts['product'] {
 const facts=proof&&proofs.get(proof)
 if(!facts||facts.tx!==expected.tx||facts.compositeId!==expected.compositeId||facts.assignmentRef!==expected.assignmentRef||facts.respondentUserId!==expected.respondentUserId
  ||(facts.subjectUserId??facts.respondentUserId)!==(expected.subjectUserId??expected.respondentUserId))
  throw new Error('EDUCATION_START_CONTEXT_MISMATCH')
 return facts.product
}
export function readVerifiedCompositionStart(proof:VerifiedEducationStart|undefined,expected:Omit<Facts,'product'>){
 if(!proof)return undefined
 readVerifiedEducationStart(proof,expected)
 return proofs.get(proof)?.composition
}
export interface VerifiedEducationAttempt { readonly kind:'VERIFIED_EDUCATION_ATTEMPT' }
const attempts=new WeakMap<object,Facts&{attemptId:string}>()
export function bindVerifiedEducationAttempt(proof:VerifiedEducationStart,tx:object,parent:{id:string;compositeAssessmentId:string;assignmentRef:string|null;userId:string|null;subjectUserId:string|null;respondentUserId:string|null}):VerifiedEducationAttempt {
 const product=readVerifiedEducationStart(proof,{tx,compositeId:parent.compositeAssessmentId,assignmentRef:parent.assignmentRef??'',
  subjectUserId:parent.subjectUserId??'',respondentUserId:parent.userId??''})
 if(parent.respondentUserId!==parent.userId||!parent.id)throw new Error('EDUCATION_START_CONTEXT_MISMATCH')
 const bound=Object.freeze({kind:'VERIFIED_EDUCATION_ATTEMPT' as const});attempts.set(bound,{...proofs.get(proof)!,product,attemptId:parent.id});return bound
}
export function readVerifiedEducationAttempt(proof:VerifiedEducationAttempt|undefined,tx:object,attemptId:string,userId:string|null):Facts['product']|undefined {
 if(!proof)return undefined
 const facts=attempts.get(proof)
 if(!facts||facts.tx!==tx||facts.attemptId!==attemptId||facts.respondentUserId!==userId)throw new Error('EDUCATION_START_CONTEXT_MISMATCH')
 return facts.product
}
export function readVerifiedCompositionAttempt(proof:VerifiedEducationAttempt|undefined,tx:object,attemptId:string,userId:string|null,expected:{compositeId:string;assignmentRef:string}){
 if(!readVerifiedEducationAttempt(proof,tx,attemptId,userId))return undefined
 const facts=attempts.get(proof!)!
 if(facts.compositeId!==expected.compositeId||facts.assignmentRef!==expected.assignmentRef)throw new Error('EDUCATION_START_CONTEXT_MISMATCH')
 return facts.composition
}
import type {EducationCompositionPolicyBinding} from '../education-tools/private-tool.composition-contracts'

/** Only a real registered longitudinal Run START may use per-parent admission. */
export function readVerifiedLongitudinalEducationAttempt(proof:VerifiedEducationAttempt|undefined,tx:object,parent:{id:string;compositeAssessmentId:string;assignmentRef:string|null},userId:string|null){
 if(!readVerifiedEducationAttempt(proof,tx,parent.id,userId))return false
 const facts=attempts.get(proof!)!
 if(facts.compositeId!==parent.compositeAssessmentId||facts.assignmentRef!==parent.assignmentRef)throw new Error('EDUCATION_START_CONTEXT_MISMATCH')
 return facts.longitudinal===true&&!facts.composition
}
