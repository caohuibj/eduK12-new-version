import {Prisma} from '@prisma/client'
import type {StoredRelease} from '../measurement-content/repository'
import {ContentReleaseError} from '../measurement-content/release'

class PrivateReferenceUseError extends ContentReleaseError {readonly statusCode=409}
function deny():never{throw new PrivateReferenceUseError('CONTENT_TRAINING_REFERENCE_SCOPE_DENIED')}
// A receipt belongs only to this transaction's fresh reference admission. Row
// locks preserve the principal facts; wall time can still pass during later
// reference locks, child creation or completed-unit/outbox writes.
const admissionExpiries=new WeakMap<object,Date>()
/** Call after the transaction's final admission write. Do not consume the
 * receipt: an enclosing adapter may still write before its own final fence.
 * Historical replay never enrolls, so its fence is a query-free no-op. */
export async function assertTrainingPrivateReferenceAdmissionCurrent(tx:Prisma.TransactionClient){
 const expiry=admissionExpiries.get(tx)
 if(!expiry)return
 const [clock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
 if(!clock||expiry<=clock.now)deny()
}

/** Explicit use of an existing aggregate release, not sample access or copying.
 * A producer's immutable PUBLISH receipt is the course authority provenance.
 * Only scope metadata is read: never candidate payload, manifest or source IDs. */
export async function assertTrainingPrivateReferenceCourseUse(tx:Prisma.TransactionClient,input:{
 release:StoredRelease;ownerId:string;compositeId:string;currentAdmission:boolean;draftSelection:boolean;recordAdmissionExpiry?:boolean
}){
 try{return await assertCourseUse(tx,input)}
 catch(error){
  // Target revision CAS already owns its parent lock. Do not wait for a second
  // source/course lock and create a reverse-order deadlock with another editor.
  const e=error as {code?:string;meta?:{code?:string}}
  if(e.code==='55P03'||e.meta?.code==='55P03')throw new PrivateReferenceUseError('CONTENT_TRAINING_REFERENCE_SCOPE_BUSY_RETRY')
  throw error
 }
}
async function assertCourseUse(tx:Prisma.TransactionClient,input:{
 release:StoredRelease;ownerId:string;compositeId:string;currentAdmission:boolean;draftSelection:boolean;recordAdmissionExpiry?:boolean
}){
 const {release,ownerId,compositeId}=input,scope=release.scope
 if(release.layer!=='REFERENCE'||scope.kind!=='PRIVATE'||scope.product!=='TRAINING'||scope.ownerId!==ownerId
  ||scope.resourceId===compositeId||typeof release.provenance.candidateId!=='string'||typeof release.provenance.reviewId!=='string')deny()
 const receipts=await tx.$queryRaw<Array<{course_id:string;composite_id:string}>>(Prisma.sql`
  SELECT course_id,composite_id FROM training_reference_requests
  WHERE operation='PUBLISH' AND release_id=${release.releaseId} AND actor_id=${ownerId}
   AND composite_id=${scope.resourceId} AND candidate_id=${release.provenance.candidateId} AND review_id=${release.provenance.reviewId}
  FOR SHARE NOWAIT`)
 if(!receipts.length||receipts.some(row=>row.course_id!==receipts[0].course_id||row.composite_id!==scope.resourceId))deny()
 const courseId=receipts[0].course_id
 const tasks=await tx.$queryRaw<Array<{id:string;created_by:string;status:string;product_kind:string;questionnaire_type:string|null;course_id:string|null;public_enabled:boolean;published_at:Date|null}>>(Prisma.sql`
  SELECT id,created_by,status::text,product_kind,questionnaire_type::text,course_id,public_enabled,published_at
  FROM composite_assessments WHERE id IN (${scope.resourceId},${compositeId}) ORDER BY id FOR SHARE NOWAIT`)
 const source=tasks.find(row=>row.id===scope.resourceId),target=tasks.find(row=>row.id===compositeId)
 if(tasks.length!==2||!source||!target||source.created_by!==ownerId||target.created_by!==ownerId||!source.published_at||!['PUBLISHED','ARCHIVED'].includes(source.status)
  ||!['QUESTIONNAIRE','LEGACY_COMPOSITE'].includes(source.product_kind)
  ||target.product_kind!=='QUESTIONNAIRE'||target.questionnaire_type!=='COURSE'||target.public_enabled
  ||input.draftSelection&&target.status!=='DRAFT'||!input.draftSelection&&input.currentAdmission&&target.status!=='PUBLISHED')deny()
 const deliveries=await tx.$queryRaw<Array<{composite_id:string;course_id:string}>>(Prisma.sql`
  SELECT composite_id,course_id FROM questionnaire_course_deliveries
  WHERE composite_id IN (${scope.resourceId},${compositeId}) ORDER BY composite_id,course_id FOR SHARE NOWAIT`)
 const targetCourses=deliveries.filter(row=>row.composite_id===compositeId)
 if(!targetCourses.length||targetCourses.some(row=>row.course_id!==courseId)
  ||(source.product_kind==='QUESTIONNAIRE'
   ?source.questionnaire_type!=='COURSE'||!deliveries.some(row=>row.composite_id===scope.resourceId&&row.course_id===courseId)
   :source.course_id!==courseId))deny()
 const [course]=await tx.$queryRaw<Array<{creator_id:string;course_type:string;is_library:boolean}>>(Prisma.sql`
  SELECT creator_id,course_type,is_library FROM courses WHERE id=${courseId} FOR SHARE NOWAIT`)
 if(!course||course.creator_id!==ownerId||course.course_type!=='TRAINING_COURSE'||course.is_library)deny()
 // Ordinary scientific-grant expiry does not revoke immutable published
 // aggregate content. New use still requires the current real Training owner.
 if(input.currentAdmission){
  const [principal]=await tx.$queryRaw<Array<{role:string;account_domain:string;teacher_approved:boolean;is_active:boolean;is_frozen:boolean;must_change_password:boolean;expires_at:Date|null}>>(Prisma.sql`
   SELECT role::text,account_domain,teacher_approved,is_active,is_frozen,must_change_password,expires_at FROM users WHERE id=${ownerId} FOR SHARE NOWAIT`)
  const [clock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
  if(!principal||principal.role!=='TEACHER'||!['TRAINING','LEGACY'].includes(principal.account_domain)||!principal.teacher_approved
   ||!principal.is_active||principal.is_frozen||principal.must_change_password||!clock||principal.expires_at&&principal.expires_at<=clock.now)deny()
  if(input.recordAdmissionExpiry&&principal.expires_at){
   const previous=admissionExpiries.get(tx)
   if(!previous||principal.expires_at<previous)admissionExpiries.set(tx,new Date(principal.expires_at))
  }
 }
}
