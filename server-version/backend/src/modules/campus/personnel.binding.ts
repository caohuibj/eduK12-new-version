import {createCipheriv,createDecipheriv,createHmac,randomBytes,randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {CampusAdmissionError} from './admission.error'
import {resolveOrganizationAccessContext} from '../organization/access'
import {assertCurrentMembershipPersona} from '../organization/classRelationships'

type Tx=Prisma.TransactionClient
export const personnelFail=(code:string,status=409):never=>{throw new CampusAdmissionError(code,status)}
function key(purpose:string){
 const raw=process.env.CAMPUS_ELIGIBILITY_HMAC_KEY
 if(!raw||!/^[a-fA-F0-9]{64}$/.test(raw))personnelFail('CAMPUS_KEY_NOT_CONFIGURED',503)
 return createHmac('sha256',Buffer.from(raw!,'hex')).update('campus-personnel:v1:'+purpose).digest()
}
export const personnelHash=(value:unknown)=>createHmac('sha256',key('compare')).update(JSON.stringify(value)).digest('hex')
export function encryptPersonnel(org:string,id:string,value:unknown){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key('profile'),iv)
 cipher.setAAD(Buffer.from(org+'\0'+id))
 const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()])
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.')
}
export type PersonnelProfile={number:string;name:string;username:string}
export function decryptPersonnel(org:string,id:string,raw:string):PersonnelProfile{
 const [version,iv,tag,body]=raw.split('.')
 if(version!=='v1')personnelFail('PERSONNEL_CIPHER_UNAVAILABLE',503)
 const cipher=createDecipheriv('aes-256-gcm',key('profile'),Buffer.from(iv,'base64url'))
 cipher.setAAD(Buffer.from(org+'\0'+id));cipher.setAuthTag(Buffer.from(tag,'base64url'))
 return JSON.parse(Buffer.concat([cipher.update(Buffer.from(body,'base64url')),cipher.final()]).toString('utf8'))
}
export type PersonnelRow={id:string;organizationId:string;kind:'STUDENT'|'STAFF';persona:string;classUnitId:string|null;eligibilityId:string|null;expectedUserId:string|null;claimedUserId:string|null;profileCipher:string;numberDigest:string}
const selection=Prisma.sql`id,organization_id AS "organizationId",kind,persona,class_unit_id AS "classUnitId",eligibility_id AS "eligibilityId",expected_user_id AS "expectedUserId",claimed_user_id AS "claimedUserId",profile_cipher AS "profileCipher",number_digest AS "numberDigest"`
export async function personnelById(tx:Tx,org:string,id:string){
 const rows=await tx.$queryRaw<PersonnelRow[]>(Prisma.sql`SELECT ${selection} FROM campus_personnel WHERE organization_id=${org} AND id=${id} FOR UPDATE`)
 return rows[0]??personnelFail('PERSONNEL_NOT_FOUND',404)
}
export async function assertPersonnelGovernor(tx:Tx,actor:{userId:string;accountDomain?:string;platformRole:any},org:string){
 if(actor.accountDomain!=='SCHOOL')personnelFail('CAMPUS_GOVERNANCE_REQUIRED',403)
 const [ctx,user]=await Promise.all([resolveOrganizationAccessContext({principal:actor,organizationId:org},tx),tx.user.findUnique({where:{id:actor.userId},select:{isActive:true,isFrozen:true,expiresAt:true,accountDomain:true}})])
 if(!ctx||ctx.productDomain!=='SCHOOL'||ctx.organizationStatus!=='ACTIVE'||!ctx.membershipId||ctx.orgRole!=='ORG_ADMIN'||!ctx.canGovern||!user||user.accountDomain!=='SCHOOL'||!user.isActive||user.isFrozen||(user.expiresAt&&user.expiresAt<=new Date()))personnelFail('CAMPUS_GOVERNANCE_REQUIRED',403)
 return ctx!
}
/** A credential is person-bound even when redeemed through the old routes.
 * Old generic class codes cannot claim imported eligibilities. */
export async function checkPersonnelCredential(tx:Tx,input:{studentCodeId?:string;staffInvitationId?:string;eligibilityId?:string;actorUserId?:string}){
 const records=await tx.$queryRaw<Array<{id:string;personId:string;organizationId:string;issuedBy:string;createdAt:Date;revokedAt:Date|null}>>`
  SELECT id,person_id AS "personId",organization_id AS "organizationId",issued_by_user_id AS "issuedBy",created_at AS "createdAt",revoked_at AS "revokedAt"
  FROM campus_personnel_credentials WHERE (${input.studentCodeId??null}::text IS NOT NULL AND student_code_id=${input.studentCodeId??null})
    OR (${input.staffInvitationId??null}::text IS NOT NULL AND staff_invitation_id=${input.staffInvitationId??null})
 `
 const credential=records[0]
 if(!credential){
  if(input.eligibilityId){const imported=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM campus_personnel WHERE eligibility_id=${input.eligibilityId}`;if(imported.length)personnelFail('CAMPUS_REGISTRATION_UNAVAILABLE')}
  return null
 }
 const person=await personnelById(tx,credential.organizationId,credential.personId)
 const current=await tx.$queryRaw<Array<{revokedAt:Date|null}>>`SELECT revoked_at AS "revokedAt" FROM campus_personnel_credentials WHERE id=${credential.id} FOR UPDATE`
 if(!current[0]||current[0].revokedAt||credential.revokedAt||person.claimedUserId||(input.eligibilityId&&person.eligibilityId!==input.eligibilityId)||(person.expectedUserId?person.expectedUserId!==input.actorUserId:!!input.actorUserId))personnelFail('CAMPUS_REGISTRATION_UNAVAILABLE')
 const issuer=await tx.user.findUnique({where:{id:credential.issuedBy},select:{platformRole:true}})
 if(!issuer)personnelFail('CAMPUS_REGISTRATION_UNAVAILABLE')
 const ctx=await assertPersonnelGovernor(tx,{userId:credential.issuedBy,accountDomain:'SCHOOL',platformRole:issuer!.platformRole},credential.organizationId)
 const membership=await tx.organizationMembership.findUnique({where:{id:ctx.membershipId!},select:{validFrom:true}})
 if(!membership||membership.validFrom>credential.createdAt)personnelFail('CAMPUS_REGISTRATION_UNAVAILABLE')
 const priorDeny=await tx.organizationAccessDeny.findFirst({where:{organizationId:credential.organizationId,userId:credential.issuedBy,permission:{in:['*','ORGANIZATION_GOVERNANCE','EDUCATION_ACCESS','HUISCHOOL_ACCESS']},deniedAt:{gte:credential.createdAt}},select:{id:true}})
 if(priorDeny)personnelFail('CAMPUS_REGISTRATION_UNAVAILABLE')
 return person
}
export async function applyPersonnelAssignments(tx:Tx,person:PersonnelRow,userId:string){
 const list=await tx.$queryRaw<Array<{classUnitId:string;staffRole:string}>>`SELECT class_unit_id AS "classUnitId",staff_role AS "staffRole" FROM campus_personnel_assignments WHERE person_id=${person.id} ORDER BY class_unit_id,staff_role`
 if(!list.length)return
 const member=await tx.organizationMembership.findFirst({where:{organizationId:person.organizationId,userId,validFrom:{lte:new Date()},OR:[{validUntil:null},{validUntil:{gt:new Date()}}]},select:{id:true}})
 if(!member)personnelFail('CAMPUS_TEACHER_MEMBERSHIP_REQUIRED')
 await assertCurrentMembershipPersona(tx,{organizationId:person.organizationId,membershipId:member!.id,persona:'TEACHER'})
 for(const item of list)await tx.$executeRaw`
  INSERT INTO organization_staff_class_assignments(id,organization_id,membership_id,class_unit_id,staff_role)
  SELECT ${randomUUID()},${person.organizationId},${member!.id},${item.classUnitId},${item.staffRole}
  WHERE NOT EXISTS(SELECT 1 FROM organization_staff_class_assignments WHERE organization_id=${person.organizationId} AND membership_id=${member!.id} AND class_unit_id=${item.classUnitId} AND staff_role=${item.staffRole} AND valid_from<=statement_timestamp() AND (valid_until IS NULL OR valid_until>statement_timestamp()))
 `
}
export async function completePersonnelClaim(tx:Tx,person:PersonnelRow|null,userId:string){
 if(!person)return
 if(person.kind==='STAFF')await applyPersonnelAssignments(tx,person,userId)
 await tx.$executeRaw`UPDATE campus_personnel SET claimed_user_id=${userId} WHERE id=${person.id} AND claimed_user_id IS NULL`
}

/** Serialize imported student activation across the two education products.
 * Only imported numbers participate; neither product inherits School approval. */
export async function lockImportedStudentIdentity(tx:Tx,org:string,digest:string,actorUserId?:string){
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'education-student:'+org+':'+digest},7927))`
 const persons=await tx.$queryRaw<Array<{expected:string|null;claimed:string|null}>>`SELECT expected_user_id AS expected,claimed_user_id AS claimed FROM campus_personnel WHERE organization_id=${org} AND kind='STUDENT' AND number_digest=${digest}`
 const person=persons[0]
 if(!person)return
 const identities=await tx.$queryRaw<Array<{id:string}>>`
  SELECT claimed_user_id AS id FROM campus_student_eligibilities WHERE organization_id=${org} AND student_no_digest=${digest} AND status='VALID' AND claimed_user_id IS NOT NULL
  UNION SELECT consumed_by_user_id AS id FROM education_teacher_student_invitations WHERE organization_id=${org} AND student_no_digest=${digest} AND consumed_by_user_id IS NOT NULL
 `
 const owners=[person.expected,person.claimed,...identities.map(x=>x.id)].filter(Boolean)
 if(owners.some(id=>id!==actorUserId))personnelFail('CAMPUS_REGISTRATION_UNAVAILABLE')
}
