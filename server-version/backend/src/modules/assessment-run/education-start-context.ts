/** Server-only, transaction-bound proof issued after exact education START admission.
 * A serialized product hint cannot select the education SJT runtime path. */
export interface VerifiedEducationStart { readonly kind: 'VERIFIED_EDUCATION_START' }
type Facts={tx:object;product:'SCHOOL'|'TEACHER';compositeId:string;assignmentRef:string;respondentUserId:string}
const proofs=new WeakMap<object,Facts>()
export function issueVerifiedEducationStart(facts:Facts):VerifiedEducationStart {
 const proof=Object.freeze({kind:'VERIFIED_EDUCATION_START' as const});proofs.set(proof,{...facts});return proof
}
export function readVerifiedEducationStart(proof:VerifiedEducationStart,expected:Omit<Facts,'product'>):Facts['product'] {
 const facts=proof&&proofs.get(proof)
 if(!facts||facts.tx!==expected.tx||facts.compositeId!==expected.compositeId||facts.assignmentRef!==expected.assignmentRef||facts.respondentUserId!==expected.respondentUserId)
  throw new Error('EDUCATION_START_CONTEXT_MISMATCH')
 return facts.product
}
export interface VerifiedEducationAttempt { readonly kind:'VERIFIED_EDUCATION_ATTEMPT' }
const attempts=new WeakMap<object,Facts&{attemptId:string}>()
export function bindVerifiedEducationAttempt(proof:VerifiedEducationStart,tx:object,parent:{id:string;compositeAssessmentId:string;assignmentRef:string|null;userId:string|null;subjectUserId:string|null;respondentUserId:string|null}):VerifiedEducationAttempt {
 const product=readVerifiedEducationStart(proof,{tx,compositeId:parent.compositeAssessmentId,assignmentRef:parent.assignmentRef??'',respondentUserId:parent.userId??''})
 if(parent.subjectUserId!==parent.userId||parent.respondentUserId!==parent.userId||!parent.id)throw new Error('EDUCATION_START_CONTEXT_MISMATCH')
 const bound=Object.freeze({kind:'VERIFIED_EDUCATION_ATTEMPT' as const});attempts.set(bound,{...proofs.get(proof)!,product,attemptId:parent.id});return bound
}
export function readVerifiedEducationAttempt(proof:VerifiedEducationAttempt|undefined,tx:object,attemptId:string,userId:string|null):Facts['product']|undefined {
 if(!proof)return undefined
 const facts=attempts.get(proof)
 if(!facts||facts.tx!==tx||facts.attemptId!==attemptId||facts.respondentUserId!==userId)throw new Error('EDUCATION_START_CONTEXT_MISMATCH')
 return facts.product
}
