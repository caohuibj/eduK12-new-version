import { assertParentToolCeiling, parentToolVisibleSql } from './tool-policy'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import { createParentInviteCode, consumeParentInviteCode, hashParentInviteCode, createPendingParentRelationship, revokeParentRelationship } from '../assessment-identity/identity'
import type { ParentInviteCodeRecordV1, ParentStudentRelationshipRecordV1 } from '../assessment-identity/types'
import { canonicalHash } from '../assessment-runtime/canonical'
import { LINK_CONSENT_TEXT, LINK_CONSENT_VERSION, REPORT_CONSENT_VERSION, REPORT_CONSENT_TEXT, assertStudentConfirmation, assertExactReportBinding, fail, parseParentProjection, type ParentReportSource } from './contracts'
import { readParentReportSource } from './source'

type Principal = Pick<AuthenticatedPrincipal,'userId'|'role'|'platformRole'>
type Tx = Prisma.TransactionClient
type Link = {id:string;parentUserId:string;studentUserId:string;status:string;inviteCodeId:string|null;approvedByUserId:string|null;approvedAt:Date|null;revokedByUserId:string|null;revokedAt:Date|null;revokeReason:string|null;consentVersion:string|null;consentHash:string|null}
const usable = Prisma.sql`u.is_active = true AND u.is_frozen = false AND (u.expires_at IS NULL OR u.expires_at > statement_timestamp())`
function relationshipRecord(row:Link):ParentStudentRelationshipRecordV1 {
  return {...row,relationshipId:row.id,status:row.status as ParentStudentRelationshipRecordV1['status'],approvedAt:row.approvedAt?.toISOString()??null,revokedAt:row.revokedAt?.toISOString()??null}
}
function inviteRecord(row:{id:string;codeHash:string;studentUserId:string;courseId:string;createdByUserId:string;status:string;expiresAt:Date;consumedAt:Date|null;consumedByParentUserId:string|null}):ParentInviteCodeRecordV1 {
  return {...row,inviteCodeId:row.id,status:row.status as ParentInviteCodeRecordV1['status'],expiresAt:row.expiresAt.toISOString(),consumedAt:row.consumedAt?.toISOString()??null}
}
function expectRole(actor:Principal,role:string) {if(actor.role!==role)fail()}
async function audit(tx:Tx,actor:string,action:string,relationshipId:string|null,artifactId:string|null=null) {
  await tx.$executeRaw`INSERT INTO parent_portal_audit (id,actor_user_id,action,relationship_id,artifact_id) VALUES (${randomUUID()},${actor},${action},${relationshipId},${artifactId})`
}
async function lockLink(tx:Tx,id:string):Promise<Link> {
  await tx.$queryRaw`SELECT id FROM parent_student_relationships WHERE id=${id} FOR UPDATE`
  return await tx.parentStudentRelationship.findUnique({where:{id}}) ?? fail()
}
async function assertLiveLink(tx:Tx,row:Link) {
  if(row.status!=='ACTIVE'||!row.approvedAt||row.revokedAt)fail()
  const users=await tx.$queryRaw<Array<{count:number}>>(Prisma.sql`SELECT COUNT(*)::int AS count FROM users u WHERE ((u.id=${row.parentUserId} AND u.role='PARENT') OR (u.id=${row.studentUserId} AND u.role='STUDENT')) AND (${usable})`)
  if(users[0]?.count!==2)fail()
}
async function assertDisclosureOfficer(tx:Tx,actor:Principal,organizationId:string) {
  const rows=await tx.$queryRaw<Array<{id:string}>>`
    SELECT m.id FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
    JOIN users u ON u.id=m.user_id
    JOIN organization_capability_grants c ON c.organization_id=m.organization_id AND c.membership_id=m.id
    WHERE m.organization_id=${organizationId} AND m.user_id=${actor.userId} AND o.status='ACTIVE'
      AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
      AND c.capability='PARENT_REPORT_DISCLOSURE' AND c.revoked_at IS NULL
      AND u.is_active=true AND u.is_frozen=false AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
      AND NOT EXISTS (SELECT 1 FROM organization_access_denies d WHERE d.organization_id=m.organization_id AND d.user_id=m.user_id AND d.lifted_at IS NULL AND d.permission IN ('*','REPORT_READ','PARENT_REPORT_DISCLOSURE'))
    LIMIT 1
  `
  if(!rows.length)fail()
}
async function assertCurrentChildOrganization(tx:Tx,row:Link,organizationId:string,policyDomain:string) {
  const rows=await tx.$queryRaw<Array<{id:string}>>`
    SELECT m.id FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
    WHERE m.organization_id=${organizationId} AND m.user_id=${row.studentUserId} AND o.status='ACTIVE'
      AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
      AND NOT EXISTS (SELECT 1 FROM organization_access_denies d WHERE d.organization_id=m.organization_id AND d.user_id IN (${row.parentUserId},${row.studentUserId}) AND d.lifted_at IS NULL AND (d.permission IN ('*','REPORT_READ','REPORT_MEMBER_READ','PARENT_REPORT_READ') OR d.permission=${policyDomain})) LIMIT 1
  `
  if(!rows.length)fail()
}
const reportColumns=Prisma.sql`g.id,g.valid_from AS "validFrom",g.relationship_id AS "relationshipId",g.parent_user_id AS "parentUserId",g.student_user_id AS "studentUserId",g.source_artifact_id AS "sourceArtifactId",g.source_hash AS "sourceHash",g.source_policy_hash AS "sourcePolicyHash",g.projection_payload AS projection,g.projection_hash AS "projectionHash",a.snapshot_hash AS "artifactHash",a.artifact_payload AS "artifactPayload"`
type ReportRow={id:string;relationshipId:string;parentUserId:string;studentUserId:string;sourceArtifactId:string;sourceHash:string;sourcePolicyHash:string;projection:unknown;projectionHash:string;artifactHash:string;artifactPayload:Record<string,unknown>}
function verifiedProjection(row:ReportRow) {
  if(row.sourceHash!==row.artifactHash||canonicalHash(row.artifactPayload)!==row.sourceHash||canonicalHash(row.projection)!==row.projectionHash)fail('PARENT_SOURCE_INTEGRITY',409,'报告内容校验失败')
  const projection=parseParentProjection(row.projection,row.sourceArtifactId,row.studentUserId)
  const sourceProjection=parseParentProjection(row.artifactPayload.parentAudience,row.sourceArtifactId,row.studentUserId)
  if(canonicalHash(sourceProjection)!==row.projectionHash||projection.policyHash!==row.sourcePolicyHash)fail('PARENT_SOURCE_INTEGRITY',409)
  return projection
}
function reportScope(actor:string,child:string) {
  return Prisma.sql`g.parent_user_id=${actor} AND g.student_user_id=${child}
    AND r.id=g.relationship_id AND r.parent_user_id=g.parent_user_id AND r.student_user_id=g.student_user_id
    AND r.status='ACTIVE' AND r.approved_at IS NOT NULL AND r.revoked_at IS NULL
    AND p.role='PARENT' AND u.role='STUDENT'
    AND p.is_active=true AND p.is_frozen=false AND (p.expires_at IS NULL OR p.expires_at>statement_timestamp())
    AND u.is_active=true AND u.is_frozen=false AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
    AND (${parentToolVisibleSql})
    AND g.revoked_at IS NULL AND g.valid_from<=statement_timestamp() AND g.valid_until>statement_timestamp()
    AND consent.revoked_at IS NULL AND consent.valid_until>statement_timestamp()
    AND consent.student_user_id=g.student_user_id AND consent.parent_user_id=g.parent_user_id
    AND consent.source_hash=g.source_hash AND consent.consent_version=g.consent_version AND consent.consent_hash=g.consent_hash
    AND o.status='ACTIVE' AND a.organization_id=g.organization_id
    AND EXISTS (SELECT 1 FROM organization_memberships m WHERE m.organization_id=g.organization_id AND m.user_id=g.student_user_id AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp()))
    AND NOT EXISTS (SELECT 1 FROM organization_access_denies d WHERE d.organization_id=g.organization_id AND d.user_id IN (g.parent_user_id,g.student_user_id) AND d.lifted_at IS NULL AND (d.permission IN ('*','REPORT_READ','REPORT_MEMBER_READ','PARENT_REPORT_READ') OR d.permission=a.policy_domain))`
}
const reportJoins=Prisma.sql`parent_report_disclosure_grants g JOIN parent_student_relationships r ON r.id=g.relationship_id JOIN parent_report_consents consent ON consent.id=g.consent_id JOIN users p ON p.id=g.parent_user_id JOIN users u ON u.id=g.student_user_id JOIN organizations o ON o.id=g.organization_id JOIN reporting_analysis_artifacts a ON a.id=g.source_artifact_id`
export function createParentPortalService(db=prisma,readSource:(id:string)=>Promise<ParentReportSource>=readParentReportSource) {
  const run=<T>(operation:(tx:Tx)=>Promise<T>)=>db.$transaction(operation,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
  return {
    consentText:()=>({version:LINK_CONSENT_VERSION,text:LINK_CONSENT_TEXT}),
    async invitations(actor:Principal,courseId:string) {
      expectRole(actor,'STUDENT')
      return run(async tx=>{
        const membership=await tx.courseStudent.findUnique({where:{courseId_studentId:{courseId,studentId:actor.userId}},include:{course:{select:{isLibrary:true}}}})
        if(!membership||membership.course.isLibrary||!['ACTIVE','APPROVED'].includes(membership.status))return fail()
        const invite=createParentInviteCode({studentUserId:actor.userId,createdByUserId:actor.userId,courseId,studentCourseStatus:membership.status as 'ACTIVE'|'APPROVED',ttlMs:15*60*1000})
        await tx.parentInviteCode.create({data:{id:invite.record.inviteCodeId,codeHash:invite.record.codeHash,studentUserId:actor.userId,courseId,createdByUserId:actor.userId,status:'ACTIVE',expiresAt:new Date(invite.record.expiresAt)}})
        await audit(tx,actor.userId,'INVITE_CREATED',null)
        return {inviteCode:invite.plaintext,expiresAt:invite.record.expiresAt}
      })
    },
    async claim(actor:Principal,code:string) {
      expectRole(actor,'PARENT')
      return run(async tx=>{
        const hash=hashParentInviteCode(code)
        await tx.$queryRaw`SELECT id FROM parent_invite_codes WHERE code_hash=${hash} FOR UPDATE`
        const invite=await tx.parentInviteCode.findUnique({where:{codeHash:hash}})
        if(!invite)return fail('PARENT_INVITE_UNAVAILABLE',404,'邀请码无效或已过期')
        const prior=await tx.parentStudentRelationship.findUnique({where:{parentUserId_studentUserId:{parentUserId:actor.userId,studentUserId:invite.studentUserId}}})
        if(invite.status==='CONSUMED'&&invite.consumedByParentUserId===actor.userId&&prior?.inviteCodeId===invite.id)return {id:prior.id,status:prior.status}
        if(prior)return fail('PARENT_LINK_EXISTS',409,'关联已存在；已撤销关系需要独立核验，旧报告授权不会恢复')
        const memberships=await tx.courseStudent.findUnique({where:{courseId_studentId:{courseId:invite.courseId,studentId:invite.studentUserId}},include:{course:{select:{isLibrary:true}}}})
        if(!memberships||memberships.course.isLibrary||!['ACTIVE','APPROVED'].includes(memberships.status))return fail()
        const child=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT u.id FROM users u WHERE u.id=${invite.studentUserId} AND (${usable})`)
        if(!child.length)return fail()
        consumeParentInviteCode({record:inviteRecord(invite),plaintext:code,parentUserId:actor.userId})
        if(invite.expiresAt<=new Date())return fail('PARENT_INVITE_UNAVAILABLE',404)
        const pending=createPendingParentRelationship({parentUserId:actor.userId,studentUserId:invite.studentUserId,inviteCodeId:invite.id})
        await tx.parentInviteCode.update({where:{id:invite.id},data:{status:'CONSUMED',consumedAt:new Date(),consumedByParentUserId:actor.userId}})
        const relation=await tx.parentStudentRelationship.create({data:{id:pending.relationshipId,parentUserId:actor.userId,studentUserId:invite.studentUserId,status:'PENDING',inviteCodeId:invite.id}})
        await audit(tx,actor.userId,'LINK_CLAIMED',relation.id)
        return {id:relation.id,status:relation.status}
      })
    },
    async links(actor:Principal) {
      if(!['STUDENT','PARENT'].includes(actor.role))return fail()
      const rows=await db.$queryRaw<Array<{id:string;status:string;displayName:string|null}>>`
        SELECT r.id,r.status,CASE WHEN ${actor.role}='STUDENT' THEN COALESCE(p.nickname,p.username) ELSE NULL END AS "displayName"
        FROM parent_student_relationships r JOIN users p ON p.id=r.parent_user_id
        WHERE (${actor.role}='STUDENT' AND r.student_user_id=${actor.userId}) OR (${actor.role}='PARENT' AND r.parent_user_id=${actor.userId})
        ORDER BY r.created_at DESC LIMIT 100
      `
      return {canInvite:actor.role==='STUDENT',canClaim:actor.role==='PARENT',list:rows.map(row=>({...row,title:row.displayName??'我的关联申请',canApprove:actor.role==='STUDENT'&&row.status==='PENDING',canRevoke:row.status!=='REVOKED'})),truncated:rows.length===100}
    },
    async approve(actor:Principal,id:string,consentVersion:string) {
      expectRole(actor,'STUDENT')
      return run(async tx=>{
        const row=await lockLink(tx,id)
        if(row.studentUserId!==actor.userId)return fail()
        if(row.status==='ACTIVE'&&row.approvedByUserId===actor.userId&&row.consentVersion===consentVersion)return {id:row.id,status:row.status}
        assertStudentConfirmation({actorUserId:actor.userId,studentUserId:row.studentUserId,status:row.status,consentVersion})
        const parent=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT u.id FROM users u WHERE u.id=${row.parentUserId} AND (${usable}) AND u.role='PARENT'`)
        if(!parent.length)return fail()
        const consentHash=canonicalHash({version:LINK_CONSENT_VERSION,text:LINK_CONSENT_TEXT,parentUserId:row.parentUserId,studentUserId:row.studentUserId,relationshipId:id})
        await tx.parentStudentRelationship.update({where:{id},data:{status:'ACTIVE',approvedAt:new Date(),approvedByUserId:actor.userId,consentVersion,consentHash}})
        await audit(tx,actor.userId,'LINK_STUDENT_CONFIRMED',id)
        return {id,status:'ACTIVE'}
      })
    },
    async revoke(actor:Principal,id:string,reason:string) {
      return run(async tx=>{
        const row=await lockLink(tx,id)
        if(![row.studentUserId,row.parentUserId].includes(actor.userId))return fail()
        if(row.status==='REVOKED')return {id,status:'REVOKED'}
        revokeParentRelationship({relationship:relationshipRecord(row),actorUserId:actor.userId,reason})
        await tx.parentStudentRelationship.update({where:{id},data:{status:'REVOKED',revokedAt:new Date(),revokedByUserId:actor.userId,revokeReason:reason}})
        await tx.$executeRaw`UPDATE parent_report_disclosure_grants SET revoked_at=statement_timestamp(),revoked_by_user_id=${actor.userId},revoke_reason='RELATIONSHIP_REVOKED' WHERE relationship_id=${id} AND revoked_at IS NULL`
        await tx.$executeRaw`UPDATE parent_report_consents SET revoked_at=statement_timestamp() WHERE relationship_id=${id} AND revoked_at IS NULL`
        await audit(tx,actor.userId,'LINK_REVOKED',id)
        return {id,status:'REVOKED'}
      })
    },
    async children(actor:Principal,page:number,pageSize:number) {
      expectRole(actor,'PARENT')
      const rows=await db.$queryRaw<Array<{relationshipId:string;childId:string;displayName:string}>>(Prisma.sql`
        SELECT r.id AS "relationshipId",u.id AS "childId",COALESCE(u.nickname,u.username) AS "displayName"
        FROM parent_student_relationships r JOIN users u ON u.id=r.student_user_id
        WHERE r.parent_user_id=${actor.userId} AND r.status='ACTIVE' AND r.approved_at IS NOT NULL AND r.revoked_at IS NULL AND (${usable}) AND u.role='STUDENT'
        ORDER BY r.created_at,r.id LIMIT ${pageSize+1} OFFSET ${(page-1)*pageSize}`)
      return {list:rows.slice(0,pageSize),hasMore:rows.length>pageSize,page,pageSize}
    },
    async overview(actor:Principal,childId:string) {
      expectRole(actor,'PARENT')
      return run(async tx=>{
        const row=await tx.parentStudentRelationship.findUnique({where:{parentUserId_studentUserId:{parentUserId:actor.userId,studentUserId:childId}}})??fail()
        await lockLink(tx,row.id);await assertLiveLink(tx,row)
        const child=await tx.user.findUnique({where:{id:childId},select:{nickname:true,username:true}})??fail()
        const courses=await tx.courseStudent.findMany({where:{studentId:childId,status:{in:['ACTIVE','APPROVED']},course:{isLibrary:false}},take:20,select:{course:{select:{id:true,title:true}}}})
        return {child:{id:childId,displayName:child.nickname??child.username},relationshipId:row.id,courses:courses.map(item=>item.course)}
      })
    },
    async reportConsentPreview(actor:Principal,relationshipId:string,artifactId:string) {
      expectRole(actor,'STUDENT')
      const source=await readSource(artifactId)
      return run(async tx=>{
        const row=await lockLink(tx,relationshipId);await assertLiveLink(tx,row)
        if(row.studentUserId!==actor.userId||source.subjectUserId!==row.studentUserId||!source.organizationId)return fail()
        await assertCurrentChildOrganization(tx,row,source.organizationId,source.policyDomain);await assertParentToolCeiling(tx,source.projection)
        const parent=await tx.user.findUnique({where:{id:row.parentUserId},select:{nickname:true,username:true}})??fail()
        return {relationshipId,artifactId,parentName:parent.nickname??parent.username,projection:source.projection,
          consentVersion:REPORT_CONSENT_VERSION,consentText:REPORT_CONSENT_TEXT,commandKey:randomUUID(),canConsent:true}
      })
    },
    async acceptReportConsent(actor:Principal,relationshipId:string,artifactId:string,commandKey:string,consentVersion:string) {
      expectRole(actor,'STUDENT')
      if(consentVersion!==REPORT_CONSENT_VERSION)return fail('PARENT_CONSENT_VERSION',409)
      const source=await readSource(artifactId)
      return run(async tx=>{
        const row=await lockLink(tx,relationshipId);await assertLiveLink(tx,row)
        if(row.studentUserId!==actor.userId||source.subjectUserId!==row.studentUserId)return fail()
        if(!source.organizationId)return fail('PARENT_SOURCE_UNSUPPORTED',409)
        await assertCurrentChildOrganization(tx,row,source.organizationId,source.policyDomain);await assertParentToolCeiling(tx,source.projection)
        const existing=await tx.$queryRaw<Array<{id:string;relationshipId:string;artifactId:string;sourceHash:string}>>`SELECT id,relationship_id AS "relationshipId",source_artifact_id AS "artifactId",source_hash AS "sourceHash" FROM parent_report_consents WHERE student_user_id=${actor.userId} AND command_key=${commandKey}`
        if(existing.length) {
          if(existing[0].relationshipId!==relationshipId||existing[0].artifactId!==artifactId||existing[0].sourceHash!==source.sourceHash)return fail('PARENT_COMMAND_CONFLICT',409)
          return {consentId:existing[0].id}
        }
        const id=randomUUID();const consentHash=canonicalHash({version:consentVersion,sourceHash:source.sourceHash,sourcePolicyHash:source.projection.policyHash,relationshipId,parentUserId:row.parentUserId,studentUserId:row.studentUserId,artifactId})
        await tx.$executeRaw`INSERT INTO parent_report_consents (id,relationship_id,student_user_id,parent_user_id,source_artifact_id,source_hash,consent_version,consent_hash,valid_until,command_key) VALUES (${id},${relationshipId},${row.studentUserId},${row.parentUserId},${artifactId},${source.sourceHash},${consentVersion},${consentHash},statement_timestamp()+interval '30 days',${commandKey})`
        await audit(tx,actor.userId,'REPORT_CONSENT_ACCEPTED',relationshipId,artifactId)
        return {consentId:id}
      })
    },
    async grantReport(actor:Principal,relationshipId:string,artifactId:string,consentId:string,commandKey:string) {
      const source=await readSource(artifactId)
      return run(async tx=>{
        const row=await lockLink(tx,relationshipId);await assertLiveLink(tx,row)
        if(source.subjectUserId!==row.studentUserId||!source.organizationId)return fail()
        await assertDisclosureOfficer(tx,actor,source.organizationId);await assertCurrentChildOrganization(tx,row,source.organizationId,source.policyDomain);await assertParentToolCeiling(tx,source.projection)
        const consents=await tx.$queryRaw<Array<{id:string;consentVersion:string;consentHash:string;sourceHash:string}>>`SELECT id,consent_version AS "consentVersion",consent_hash AS "consentHash",source_hash AS "sourceHash" FROM parent_report_consents WHERE id=${consentId} AND relationship_id=${relationshipId} AND source_artifact_id=${artifactId} AND student_user_id=${row.studentUserId} AND parent_user_id=${row.parentUserId} AND revoked_at IS NULL AND valid_until>statement_timestamp() FOR SHARE`
        const consent=consents[0];if(!consent||consent.sourceHash!==source.sourceHash)return fail()
        const previous=await tx.$queryRaw<Array<{id:string;relationshipId:string;sourceArtifactId:string;parentUserId:string;studentUserId:string;consentId:string;revokedAt:Date|null}>>`SELECT id,relationship_id AS "relationshipId",source_artifact_id AS "sourceArtifactId",parent_user_id AS "parentUserId",student_user_id AS "studentUserId",consent_id AS "consentId",revoked_at AS "revokedAt" FROM parent_report_disclosure_grants WHERE approved_by_user_id=${actor.userId} AND command_key=${commandKey}`
        if(previous.length){assertExactReportBinding({parentUserId:row.parentUserId,studentUserId:row.studentUserId,relationshipId,artifactId},previous[0]);if(previous[0].consentId!==consentId||previous[0].revokedAt)fail('PARENT_COMMAND_CONFLICT',409);return {grantId:previous[0].id}}
        const id=randomUUID();const projection=parseParentProjection(source.projection,artifactId,row.studentUserId)
        await tx.$executeRaw`INSERT INTO parent_report_disclosure_grants (id,relationship_id,student_user_id,parent_user_id,organization_id,source_artifact_id,source_hash,source_policy_key,source_policy_version,source_policy_hash,projection_mode,projection_payload,projection_hash,consent_id,consent_version,consent_hash,valid_until,approved_by_user_id,command_key) SELECT ${id},${relationshipId},${row.studentUserId},${row.parentUserId},${source.organizationId},${artifactId},${source.sourceHash},${projection.policy.key},${projection.policy.version},${projection.policyHash},${projection.policy.mode},${JSON.stringify(projection)}::jsonb,${canonicalHash(projection)},${consentId},${consent.consentVersion},${consent.consentHash},valid_until,${actor.userId},${commandKey} FROM parent_report_consents WHERE id=${consentId}`
        await audit(tx,actor.userId,'REPORT_DISCLOSURE_GRANTED',relationshipId,artifactId)
        return {grantId:id}
      })
    },
    async revokeReport(actor:Principal,relationshipId:string,artifactId:string,reason:string) {
      return run(async tx=>{
        const row=await lockLink(tx,relationshipId)
        if(![row.studentUserId,row.parentUserId].includes(actor.userId)){const source=await readSource(artifactId);if(!source.organizationId||source.subjectUserId!==row.studentUserId)return fail();await assertDisclosureOfficer(tx,actor,source.organizationId)}
        await tx.$executeRaw`UPDATE parent_report_disclosure_grants SET revoked_at=statement_timestamp(),revoked_by_user_id=${actor.userId},revoke_reason=${reason} WHERE relationship_id=${relationshipId} AND source_artifact_id=${artifactId} AND revoked_at IS NULL`
        await tx.$executeRaw`UPDATE parent_report_consents SET revoked_at=statement_timestamp() WHERE relationship_id=${relationshipId} AND source_artifact_id=${artifactId} AND revoked_at IS NULL`
        await audit(tx,actor.userId,'REPORT_DISCLOSURE_REVOKED',relationshipId,artifactId)
        return {revoked:true}
      })
    },
    async reports(actor:Principal,childId:string,page:number,pageSize:number) {
      expectRole(actor,'PARENT')
      const rows=await db.$queryRaw<ReportRow[]>(Prisma.sql`SELECT * FROM (SELECT DISTINCT ON (g.source_artifact_id) ${reportColumns} FROM ${reportJoins} WHERE (${reportScope(actor.userId,childId)}) ORDER BY g.source_artifact_id,g.valid_from DESC,g.id) visible ORDER BY "validFrom" DESC,id LIMIT ${pageSize+1} OFFSET ${(page-1)*pageSize}`)
      const list=rows.slice(0,pageSize).map(row=>{const projection=verifiedProjection(row);return {id:row.sourceArtifactId,grantId:row.id,title:projection.title,mode:projection.policy.mode}})
      return {list,page,pageSize,hasMore:rows.length>pageSize}
    },
    async readReport(actor:Principal,childId:string,artifactId:string) {
      expectRole(actor,'PARENT')
      return run(async tx=>{
        const rows=await tx.$queryRaw<ReportRow[]>(Prisma.sql`SELECT ${reportColumns} FROM ${reportJoins} WHERE (${reportScope(actor.userId,childId)}) AND g.source_artifact_id=${artifactId} ORDER BY g.valid_from DESC LIMIT 1 FOR SHARE OF r,g,consent,o,p,u`)
        if(!rows.length)return fail()
        const projection=verifiedProjection(rows[0]);await assertParentToolCeiling(tx,projection);await audit(tx,actor.userId,'REPORT_READ',rows[0].relationshipId,artifactId)
        return {schemaVersion:1,artifactId,relationshipId:rows[0].relationshipId,canRevoke:true,audience:'PARENT',mode:projection.policy.mode,title:projection.title,summary:projection.summary,blocks:projection.blocks}
      })
    },
  }
}
export const parentPortalService=createParentPortalService()
