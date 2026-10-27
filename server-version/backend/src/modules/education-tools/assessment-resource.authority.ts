import {educationDeliveryAuthoritySchema,type EducationDeliveryAuthority} from './assessment-resource.contract'
import {Prisma} from '@prisma/client'
import {readEducationRunLibraryContext} from '../assessment-run/educationLibraryContext'
import {assertCurrentRunManagerBoundary} from '../assessment-run/resourceBoundary'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'
import {readEducationAssessmentDeliveryIdentity,EducationAssessmentSourceError} from './assessment-resource.repository'

/** Source approval names original actors; a replacement administrator does not
 * retroactively repair their revoked authority. This is checked for new use,
 * not used to recalculate or silently withdraw an already accepted FINAL.
 */
export async function assertEducationDeliveryIssuerCurrent(tx:Prisma.TransactionClient,input:{
 proof:EducationDeliveryAuthority;organizationId:string;product:'SCHOOL'|'TEACHER'
}){
 const proof=educationDeliveryAuthoritySchema.parse(input.proof)
 const deny=()=>{throw new EducationAssessmentSourceError('EDUCATION_ASSESSMENT_ORIGINAL_ISSUER_REVOKED')}
 if(proof.kind==='SYSTEM_ADMIN'){
  const [platform]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM users WHERE id=${proof.actorId}
   AND platform_role='SYSTEM_ADMIN' AND account_domain IN ('TRAINING','LEGACY') AND is_active=TRUE AND is_frozen=FALSE
   AND must_change_password=FALSE AND (expires_at IS NULL OR expires_at>clock_timestamp())`)
  if(!platform)deny()
  return
 }
 const product=input.product==='TEACHER'?'HUITEACHER' as const:'HUISCHOOL' as const
 const scope={actorUserId:proof.actorId,organizationId:input.organizationId,product,
  ...(proof.kind==='PSYCHOLOGY_STAFF'?{requiredCapability:'PSYCHOLOGY_STAFF' as const}:{})}
 const member=await resolveEducationProductMemberScope(scope,tx)
 if(!member||member.membershipId!==proof.membershipId||proof.kind==='PRODUCT_ADMIN'&&!member.productAdmin)deny()
 const rows=proof.kind==='PRODUCT_ADMIN'
  ?await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM education_product_role_grants
    WHERE id=${proof.grantId} AND organization_id=${input.organizationId} AND membership_id=${proof.membershipId}
      AND product=${product} AND role='PRODUCT_ADMIN' AND revoked_at IS NULL`)
  :await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT persona.id FROM organization_persona_grants persona
    JOIN organization_capability_grants capability ON capability.organization_id=persona.organization_id
      AND capability.membership_id=persona.membership_id
    WHERE persona.id=${proof.personaGrantId} AND capability.id=${proof.capabilityGrantId}
      AND persona.organization_id=${input.organizationId} AND persona.membership_id=${proof.membershipId}
      AND persona.persona='COUNSELOR' AND persona.revoked_at IS NULL
      AND capability.capability='PSYCHOLOGY_STAFF' AND capability.revoked_at IS NULL`)
 if(rows.length!==1)deny()
}

/** A product-scoped approved delivery is organization use permission, not a
 * Training credential or a participant report grant. All caller identity comes
 * from the existing authenticated workflow; never infer the product from key.
 */
export async function assertEducationAssessmentRunUse(tx:Prisma.TransactionClient,input:{
 actorUserId:string;organizationId:string;runId:string;resource:{family:string;key:string;version:string}
}){
 const workflow=await readEducationRunLibraryContext(tx,input)
 if(!workflow)throw new EducationAssessmentSourceError('EDUCATION_ASSESSMENT_WORKFLOW_REQUIRED')
 // Governance writers acquire Organization UPDATE. Keep Organization before
 // delivery/source locks; do not take a User lock after it.
 await tx.$queryRaw(Prisma.sql`SELECT id FROM organizations WHERE id=${input.organizationId} FOR SHARE`)
 const current=await readEducationRunLibraryContext(tx,input)
 if(!current||current.product!==workflow.product||current.schoolCourseId!==workflow.schoolCourseId||current.teacherEventId!==workflow.teacherEventId)
  throw new EducationAssessmentSourceError('EDUCATION_ASSESSMENT_WORKFLOW_CHANGED')
 await assertCurrentRunManagerBoundary(input,tx)
 const source=await readEducationAssessmentDeliveryIdentity(tx,{resourceKey:input.resource.key,version:input.resource.version,purpose:'NEW_USE'})
 if(source.origin.product!==workflow.product||source.origin.organizationId!==input.organizationId||source.origin.family!==input.resource.family)
  throw new EducationAssessmentSourceError('EDUCATION_ASSESSMENT_WORKFLOW_MISMATCH')
 for(const proof of [...source.authority].sort((a,b)=>a.actorId.localeCompare(b.actorId)))
  await assertEducationDeliveryIssuerCurrent(tx,{proof,organizationId:input.organizationId,product:workflow.product})
 return source
}
