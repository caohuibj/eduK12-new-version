import {lockEducationAssessmentUsers} from './assessment-resource.locks'
import {Prisma} from '@prisma/client'
import type {AuthenticatedPrincipal} from '../../types'
import {validAdminProof,ADMIN_STEP_UP_SECONDS} from '../admin-permissions/proof'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'
import {assertEducationDeliveryIssuerCurrent} from './assessment-resource.authority'
import type {EducationDeliveryAuthority} from './assessment-resource.contract'

export class EducationAssessmentManagementError extends Error {
 constructor(readonly code:string,readonly statusCode=409){super(code);this.name='EducationAssessmentManagementError'}
}
export function educationManagementFail(code:string,status=409):never{throw new EducationAssessmentManagementError(code,status)}
export type EducationAssessmentContext={principal:AuthenticatedPrincipal;product:'SCHOOL'|'TEACHER';organizationId:string}
/** Organization is always locked before Users, and Users before delivery/source
 * rows. All User locks are SHARE, never upgraded. Static SJT source advisory
 * locks, when needed, precede this helper. Account lifecycle may start at User;
 * a nonblocking User prelock prevents waiting in the inverse order.
 * Call again at the final write fence to account for time spent waiting. */
export async function captureEducationAssessmentIssuer(tx:Prisma.TransactionClient,c:EducationAssessmentContext){
 await lockEducationAssessmentUsers(tx,[c.principal.userId])
 const [user]=await tx.$queryRaw<Array<{id:string;account_domain:string;platform_role:string;token_version:number}>>(Prisma.sql`
  SELECT id,account_domain,platform_role::text,token_version FROM users WHERE id=${c.principal.userId}
   AND is_active AND NOT is_frozen AND NOT must_change_password
   AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE`)
 if(!user||user.token_version!==c.principal.tokenVersion||user.account_domain!==c.principal.accountDomain)
  educationManagementFail('EDUCATION_ASSESSMENT_ACTOR_INVALID',403)
 if(user.platform_role==='SYSTEM_ADMIN'&&['LEGACY','TRAINING'].includes(user.account_domain)){
  if(!validAdminProof(c.principal,ADMIN_STEP_UP_SECONDS))educationManagementFail('EDUCATION_ASSESSMENT_STRONG_AUTH_REQUIRED',403)
  return {kind:'SYSTEM_ADMIN',actorId:user.id} as const
 }
 if(user.account_domain!=='SCHOOL')educationManagementFail('EDUCATION_ASSESSMENT_ENTRY_REQUIRED',403)
 const product=c.product==='TEACHER'?'HUITEACHER' as const:'HUISCHOOL' as const
 const member=await resolveEducationProductMemberScope({actorUserId:user.id,organizationId:c.organizationId,product},tx)
 if(!member)educationManagementFail('EDUCATION_ASSESSMENT_ISSUER_REQUIRED',403)
 if(member.productAdmin){
  const [grant]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM education_product_role_grants
   WHERE organization_id=${c.organizationId} AND membership_id=${member.membershipId} AND product=${product}
    AND role='PRODUCT_ADMIN' AND revoked_at IS NULL ORDER BY id LIMIT 1 FOR SHARE`)
  if(!grant)educationManagementFail('EDUCATION_ASSESSMENT_ISSUER_REQUIRED',403)
  return {kind:'PRODUCT_ADMIN',actorId:user.id,membershipId:member.membershipId,grantId:grant.id} as const
 }
 const professional=await resolveEducationProductMemberScope({actorUserId:user.id,organizationId:c.organizationId,product,requiredCapability:'PSYCHOLOGY_STAFF'},tx)
 if(!professional)educationManagementFail('EDUCATION_ASSESSMENT_ISSUER_REQUIRED',403)
 const [grant]=await tx.$queryRaw<Array<{personaId:string;capabilityId:string}>>(Prisma.sql`
  SELECT persona.id AS "personaId",capability.id AS "capabilityId" FROM organization_persona_grants persona
   JOIN organization_capability_grants capability ON capability.organization_id=persona.organization_id AND capability.membership_id=persona.membership_id
   WHERE persona.organization_id=${c.organizationId} AND persona.membership_id=${professional.membershipId}
    AND persona.persona='COUNSELOR' AND persona.revoked_at IS NULL
    AND capability.capability='PSYCHOLOGY_STAFF' AND capability.revoked_at IS NULL
   ORDER BY persona.id,capability.id LIMIT 1 FOR SHARE OF persona,capability`)
 if(!grant)educationManagementFail('EDUCATION_ASSESSMENT_ISSUER_REQUIRED',403)
 return {kind:'PSYCHOLOGY_STAFF',actorId:user.id,membershipId:professional.membershipId,personaGrantId:grant.personaId,capabilityGrantId:grant.capabilityId} as const
}
export async function lockEducationAssessmentOrganization(tx:Prisma.TransactionClient,c:Pick<EducationAssessmentContext,'organizationId'|'product'>){
 const [org]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM organizations
  WHERE id=${c.organizationId} AND product_domain='SCHOOL' AND status='ACTIVE' FOR UPDATE`)
 const product=c.product==='TEACHER'?'HUITEACHER':'HUISCHOOL'
 const [entitlement]=await tx.$queryRaw<Array<{organization_id:string}>>(Prisma.sql`SELECT organization_id FROM education_product_entitlements
  WHERE organization_id=${c.organizationId} AND product=${product} AND status='ACTIVE' FOR SHARE`)
 if(!org||!entitlement)educationManagementFail('EDUCATION_ASSESSMENT_ORGANIZATION_UNAVAILABLE',403)
}
export async function retainEducationAssessmentIssuers(tx:Prisma.TransactionClient,c:Pick<EducationAssessmentContext,'organizationId'|'product'>,proofs:EducationDeliveryAuthority[]){
 const ids=[...new Set(proofs.map(proof=>proof.actorId))].sort()
 await lockEducationAssessmentUsers(tx,ids)
 for(const proof of proofs){
  if(proof.kind==='PRODUCT_ADMIN')await tx.$queryRaw(Prisma.sql`SELECT id FROM education_product_role_grants WHERE id=${proof.grantId} FOR SHARE`)
  if(proof.kind==='PSYCHOLOGY_STAFF'){
   await tx.$queryRaw(Prisma.sql`SELECT id FROM organization_persona_grants WHERE id=${proof.personaGrantId} FOR SHARE`)
   await tx.$queryRaw(Prisma.sql`SELECT id FROM organization_capability_grants WHERE id=${proof.capabilityGrantId} FOR SHARE`)
  }
  await assertEducationDeliveryIssuerCurrent(tx,{...c,proof})
 }
}
