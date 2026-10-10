import { randomInt,randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import { CampusActivityError,lockSchoolActivity,lockAndAssertCampusActivityEditor } from './activity.service'
import { appendAudit } from '../organization/service'

type Tx=Prisma.TransactionClient
export const CAMPUS_PEER_CONSENT_VERSION='HUISCHOOL_PEER_V1'
export const CAMPUS_PEER_MIN_COHORT=5
const fail=(code:string,statusCode=403):never=>{throw new CampusActivityError(code,statusCode)}
export const campusPeerDisclosure=()=>({
  version:CAMPUS_PEER_CONSENT_VERSION,
  minimumCohort:CAMPUS_PEER_MIN_COHORT,
  text:'这是一项自愿的同伴互评。学校将随机分配同班同学；你的回答不会自动向被评价的同学、普通教师或家长公开。你可以撤回未完成的参与授权。该活动不是心理诊断。',
})
type Eligible={membershipId:string;classUnitId:string;userId:string}
async function eligibleStudents(tx:Tx,organizationId:string,courseId:string,classUnitId?:string):Promise<Eligible[]> {
  const rows=await tx.$queryRaw<Eligible[]>(Prisma.sql`
    SELECT DISTINCT m."id" AS "membershipId",e."class_unit_id" AS "classUnitId",
      u."id" AS "userId"
    FROM "campus_activity_participants" p
    JOIN "campus_activities" a ON a."course_id"=p."course_id"
      AND a."organization_id"=p."organization_id" AND a."status"='OPEN'
    JOIN "organizations" org ON org."id"=a."organization_id"
      AND org."product_domain"='SCHOOL' AND org."status"='ACTIVE'
    JOIN "organization_memberships" m ON m."id"=p."membership_id"
      AND m."organization_id"=p."organization_id"
      AND m."valid_from"<=statement_timestamp()
      AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
    JOIN "users" u ON u."id"=m."user_id" AND u."account_domain"='SCHOOL'
      AND u."role"='STUDENT' AND u."is_active"=TRUE AND u."is_frozen"=FALSE
      AND u."must_change_password"=FALSE
    JOIN "campus_student_enrollments" e ON e."user_id"=u."id"
      AND e."organization_id"=a."organization_id" AND e."status"='APPROVED'
    JOIN "campus_class_admissions" ca ON ca."organization_id"=e."organization_id"
      AND ca."class_unit_id"=e."class_unit_id" AND ca."status"='APPROVED'
    JOIN "organization_student_class_assignments" sc
      ON sc."organization_id"=e."organization_id"
      AND sc."membership_id"=m."id" AND sc."class_unit_id"=e."class_unit_id"
      AND sc."valid_from"<=statement_timestamp()
      AND (sc."valid_until" IS NULL OR sc."valid_until">statement_timestamp())
    JOIN "organization_persona_grants" pg
      ON pg."organization_id"=m."organization_id"
      AND pg."membership_id"=m."id" AND pg."persona"='STUDENT' AND pg."revoked_at" IS NULL
    WHERE p."organization_id"=${organizationId} AND p."course_id"=${courseId}
      AND p."status"='ACTIVE'
      ${classUnitId?Prisma.sql`AND e."class_unit_id"=${classUnitId}`:Prisma.empty}
      AND NOT EXISTS (SELECT 1 FROM "organization_access_denies" d
        WHERE d."organization_id"=m."organization_id" AND d."user_id"=u."id"
          AND d."lifted_at" IS NULL AND d."permission" IN ('*','ACTIVITY_READ','RUN_START','PEER_ASSESS'))
    ORDER BY m."id" LIMIT 501
  `)
  return rows
}
async function revokePairRows(tx:Tx,courseId:string,membershipId:string){
  await tx.$executeRaw`
    UPDATE "campus_peer_assignments" SET "status"='REVOKED',
      "revoked_at"=statement_timestamp()
    WHERE "course_id"=${courseId} AND "status"='ACTIVE'
      AND ("subject_membership_id"=${membershipId}
        OR "respondent_membership_id"=${membershipId})
  `
}
export async function studentPeerConsent(input:{
  actor:AuthenticatedPrincipal;organizationId:string;courseId:string
  action:'ASSENT'|'WITHDRAW'
}){
  if(input.actor.accountDomain!=='SCHOOL'||input.actor.role!=='STUDENT')
    fail('CAMPUS_STUDENT_REQUIRED')
  return prisma.$transaction(async tx=>{
    const activity=await lockSchoolActivity(tx,input.organizationId,input.courseId)
    if(input.action==='ASSENT' && activity.status!=='OPEN')fail('CAMPUS_PEER_ACTIVITY_NOT_OPEN',409)
    const eligible=await eligibleStudents(tx,input.organizationId,input.courseId)
    const member=eligible.find(row=>row.userId===input.actor.userId)
    if(!member)fail('CAMPUS_PEER_NOT_ELIGIBLE')
    if(input.action==='ASSENT'){
      await tx.$executeRaw`
        INSERT INTO "campus_peer_consents"(
          "course_id","organization_id","membership_id","assented_at","consent_version"
        ) VALUES (${input.courseId},${input.organizationId},${member.membershipId},
          statement_timestamp(),${CAMPUS_PEER_CONSENT_VERSION})
        ON CONFLICT ("course_id","membership_id") DO UPDATE
          SET "assented_at"=statement_timestamp(),"withdrawn_at"=NULL,
              "guardian_relationship_id"=NULL,"guardian_consented_at"=NULL,
              "consent_version"=EXCLUDED."consent_version"
      `
    }else{
      await tx.$executeRaw`
        UPDATE "campus_peer_consents" SET "withdrawn_at"=statement_timestamp()
        WHERE "course_id"=${input.courseId} AND "membership_id"=${member.membershipId}
          AND "withdrawn_at" IS NULL
      `
      await revokePairRows(tx,input.courseId,member.membershipId)
    }
    await appendAudit(tx,{
      organizationId:input.organizationId,actorUserId:input.actor.userId,
      action:'CAMPUS_PEER_'+input.action,targetType:'COURSE',targetId:input.courseId,
      domainEventId:randomUUID(),payload:{consentVersion:CAMPUS_PEER_CONSENT_VERSION},
    })
    return {state:input.action==='ASSENT'?'AWAITING_GUARDIAN':'WITHDRAWN',version:CAMPUS_PEER_CONSENT_VERSION}
  })
}
export async function guardianPeerConsent(input:{
  actor:AuthenticatedPrincipal;organizationId:string;courseId:string
  relationshipId:string;action:'CONSENT'|'WITHDRAW'
}){
  if(input.actor.accountDomain!=='SCHOOL'||input.actor.role!=='PARENT')
    fail('CAMPUS_PARENT_REQUIRED')
  return prisma.$transaction(async tx=>{
    const activity=await lockSchoolActivity(tx,input.organizationId,input.courseId)
    if(input.action==='CONSENT'&&activity.status!=='OPEN')
      fail('CAMPUS_PEER_ACTIVITY_NOT_OPEN',409)
    const rows=await tx.$queryRaw<Array<{membershipId:string;childId:string}>>`
      SELECT c."membership_id" AS "membershipId",r."student_user_id" AS "childId"
      FROM "parent_student_relationships" r
      JOIN "organization_memberships" m ON m."user_id"=r."student_user_id"
        AND m."organization_id"=${input.organizationId}
      JOIN "campus_peer_consents" c ON c."membership_id"=m."id"
        AND c."organization_id"=m."organization_id"
        AND c."course_id"=${input.courseId}
      JOIN "users" child ON child."id"=r."student_user_id"
        AND child."account_domain"='SCHOOL' AND child."is_frozen"=FALSE
      WHERE r."id"=${input.relationshipId}
        AND r."parent_user_id"=${input.actor.userId} AND r."status"='ACTIVE'
        AND r."approved_at" IS NOT NULL AND r."revoked_at" IS NULL
        AND c."withdrawn_at" IS NULL
        AND m."valid_from"<=statement_timestamp()
        AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
      FOR UPDATE OF c
    `
    const child=rows[0]
    if(!child)fail('CAMPUS_PEER_LINK_REQUIRED')
    if(input.action==='CONSENT'){
      await tx.$executeRaw`
        UPDATE "campus_peer_consents"
        SET "guardian_relationship_id"=${input.relationshipId},
            "guardian_consented_at"=statement_timestamp()
        WHERE "course_id"=${input.courseId}
          AND "membership_id"=${child.membershipId}
          AND "withdrawn_at" IS NULL
      `
    }else{
      await tx.$executeRaw`
        UPDATE "campus_peer_consents"
        SET "guardian_relationship_id"=NULL,"guardian_consented_at"=NULL
        WHERE "course_id"=${input.courseId}
          AND "membership_id"=${child.membershipId}
      `
      await revokePairRows(tx,input.courseId,child.membershipId)
    }
    await appendAudit(tx,{
      organizationId:input.organizationId,actorUserId:input.actor.userId,
      action:'CAMPUS_PEER_GUARDIAN_'+input.action,
      targetType:'PARENT_RELATIONSHIP',targetId:input.relationshipId,
      domainEventId:randomUUID(),payload:{courseId:input.courseId,version:CAMPUS_PEER_CONSENT_VERSION},
    })
    return {state:input.action==='CONSENT'?'GUARDIAN_CONSENTED':'WITHDRAWN'}
  })
}
type EligiblePeer={membershipId:string;classUnitId:string;userId:string}
export async function allocateCampusPeers(input:{
  actor:AuthenticatedPrincipal;organizationId:string;courseId:string
  classUnitId:string;peersPerRespondent:number
}){
  if(!Number.isInteger(input.peersPerRespondent)||input.peersPerRespondent<1
    ||input.peersPerRespondent>3)fail('CAMPUS_PEER_COUNT_INVALID',400)
  return prisma.$transaction(async tx=>{
    const {activity,context}=await lockAndAssertCampusActivityEditor(tx,input)
    if(context.orgRole!=='ORG_ADMIN'||!context.canGovern)
      fail('CAMPUS_PEER_GOVERNANCE_REQUIRED')
    if(activity.status!=='OPEN')fail('CAMPUS_PEER_ACTIVITY_NOT_OPEN',409)
    const existing=await tx.$queryRaw<Array<{id:string}>>`
      SELECT "id" FROM "campus_peer_assignments"
      WHERE "course_id"=${input.courseId} LIMIT 1
    `
    if(existing.length)fail('CAMPUS_PEER_ALLOCATION_FROZEN',409)
    const eligible=await eligibleStudents(tx,input.organizationId,input.courseId,input.classUnitId)
    if(eligible.length<CAMPUS_PEER_MIN_COHORT||eligible.length>500)
      fail('CAMPUS_PEER_PRIVACY_FLOOR',409)
    const valid=await tx.$queryRaw<Array<{membershipId:string}>>`
      SELECT c."membership_id" AS "membershipId"
      FROM "campus_peer_consents" c
      JOIN "parent_student_relationships" r ON r."id"=c."guardian_relationship_id"
        AND r."status"='ACTIVE' AND r."approved_at" IS NOT NULL AND r."revoked_at" IS NULL
      JOIN "organization_memberships" m ON m."id"=c."membership_id"
        AND m."organization_id"=c."organization_id"
      WHERE c."organization_id"=${input.organizationId}
        AND c."course_id"=${input.courseId}
        AND c."withdrawn_at" IS NULL AND c."consent_version"=${CAMPUS_PEER_CONSENT_VERSION}
        AND c."guardian_consented_at" IS NOT NULL
        AND r."student_user_id"=m."user_id"
        AND m."valid_from"<=statement_timestamp()
        AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
    `
    const consented=new Set(valid.map(row=>row.membershipId))
    if(!eligible.every(row=>consented.has(row.membershipId)))
      fail('CAMPUS_PEER_INCOMPLETE_CONSENT',409)
    // Use a secure shuffle and a bounded cyclic allocation, never O(n²).
    // No self-pairs; each participant is subject/observer for 1–3 peers.
    const shuffled=[...eligible] as EligiblePeer[]
    for(let i=shuffled.length-1;i>0;i--){
      const j=randomInt(i+1)
      ;[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]
    }
    const rows:Array<Prisma.Sql>=[]
    for(let i=0;i<shuffled.length;i++){
      for(let offset=1;offset<=input.peersPerRespondent;offset++){
        const subject=shuffled[(i+offset)%shuffled.length],respondent=shuffled[i]
        rows.push(Prisma.sql`(
          ${randomUUID()},${input.organizationId},${input.courseId},${input.classUnitId},
          ${subject.membershipId},${respondent.membershipId}
        )`)
      }
    }
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "campus_peer_assignments"(
        "id","organization_id","course_id","class_unit_id",
        "subject_membership_id","respondent_membership_id"
      ) VALUES ${Prisma.join(rows)}
    `)
    await appendAudit(tx,{
      organizationId:input.organizationId,actorUserId:input.actor.userId,
      action:'CAMPUS_PEER_ALLOCATED',targetType:'COURSE',targetId:input.courseId,
      domainEventId:randomUUID(),payload:{
        cohort:eligible.length,peersPerRespondent:input.peersPerRespondent,
        classUnitId:input.classUnitId,consentVersion:CAMPUS_PEER_CONSENT_VERSION,
      },
    })
    return {cohortSize:eligible.length,assignments:rows.length,
      privacyFloor:CAMPUS_PEER_MIN_COHORT}
  })
}
/** Subject aliases are pseudonyms, limited to the respondent's own approved
 * assignments. The API never returns scores or other pupils' answers.
 */
export async function myCampusPeerTargets(input:{
  actor:AuthenticatedPrincipal;organizationId:string;courseId:string
}){
  if(input.actor.accountDomain!=='SCHOOL'||input.actor.role!=='STUDENT')
    fail('CAMPUS_STUDENT_REQUIRED')
  const eligible=await prisma.$transaction(tx=>
    eligibleStudents(tx,input.organizationId,input.courseId))
  if(!eligible.some(x=>x.userId===input.actor.userId))fail('CAMPUS_PEER_NOT_ELIGIBLE')
  const rows=await prisma.$queryRaw<Array<{assignmentId:string;peerAlias:string}>>`
    SELECT peer."id" AS "assignmentId",alias."login_name" AS "peerAlias"
    FROM "campus_peer_assignments" peer
    JOIN "organization_memberships" respondent ON respondent."id"=peer."respondent_membership_id"
      AND respondent."organization_id"=peer."organization_id"
      AND respondent."user_id"=${input.actor.userId}
    JOIN "organization_memberships" subject ON subject."id"=peer."subject_membership_id"
      AND subject."organization_id"=peer."organization_id"
    JOIN "campus_accounts" alias ON alias."user_id"=subject."user_id"
    JOIN "campus_activities" a ON a."course_id"=peer."course_id" AND a."status"='OPEN'
    JOIN "campus_peer_consents" sconsent ON sconsent."course_id"=peer."course_id"
      AND sconsent."membership_id"=peer."subject_membership_id"
      AND sconsent."withdrawn_at" IS NULL AND sconsent."guardian_consented_at" IS NOT NULL
    JOIN "campus_peer_consents" rconsent ON rconsent."course_id"=peer."course_id"
      AND rconsent."membership_id"=peer."respondent_membership_id"
      AND rconsent."withdrawn_at" IS NULL AND rconsent."guardian_consented_at" IS NOT NULL
    JOIN "parent_student_relationships" sg ON sg."id"=sconsent."guardian_relationship_id"
      AND sg."status"='ACTIVE' AND sg."revoked_at" IS NULL
    JOIN "parent_student_relationships" rg ON rg."id"=rconsent."guardian_relationship_id"
      AND rg."status"='ACTIVE' AND rg."revoked_at" IS NULL
    WHERE peer."organization_id"=${input.organizationId}
      AND peer."course_id"=${input.courseId} AND peer."status"='ACTIVE'
      AND respondent."valid_from"<=statement_timestamp()
      AND (respondent."valid_until" IS NULL OR respondent."valid_until">statement_timestamp())
    ORDER BY peer."id" LIMIT 4
  `
  return {list:rows}
}
export async function myPeerConsentState(actor:AuthenticatedPrincipal,organizationId:string,courseId:string){
  if(actor.accountDomain!=='SCHOOL'||actor.role!=='STUDENT')fail('CAMPUS_STUDENT_REQUIRED')
  const members=await prisma.$transaction(tx=>eligibleStudents(tx,organizationId,courseId))
  const member=members.find(x=>x.userId===actor.userId)
  if(!member)fail('CAMPUS_PEER_NOT_ELIGIBLE')
  const rows=await prisma.$queryRaw<Array<{assented:boolean;guardian:boolean;withdrawn:boolean}>>`
    SELECT "assented_at" IS NOT NULL AS "assented",
      "guardian_consented_at" IS NOT NULL AS "guardian",
      "withdrawn_at" IS NOT NULL AS "withdrawn"
    FROM "campus_peer_consents"
    WHERE "organization_id"=${organizationId} AND "course_id"=${courseId}
      AND "membership_id"=${member.membershipId}
  `
  return {assented:rows[0]?.assented===true,guardianConsented:rows[0]?.guardian===true,
    withdrawn:rows[0]?.withdrawn===true,policy:campusPeerDisclosure()}
}
export async function guardianPeerRequests(actor:AuthenticatedPrincipal){
  if(actor.accountDomain!=='SCHOOL'||actor.role!=='PARENT')fail('CAMPUS_PARENT_REQUIRED')
  const rows=await prisma.$queryRaw<Array<{courseId:string;organizationId:string;relationshipId:string;title:string;consented:boolean}>>`
    SELECT DISTINCT c."course_id" AS "courseId",
      c."organization_id" AS "organizationId",r."id" AS "relationshipId",
      course."title",c."guardian_consented_at" IS NOT NULL AS "consented"
    FROM "campus_peer_consents" c
    JOIN "organization_memberships" m ON m."id"=c."membership_id"
      AND m."organization_id"=c."organization_id"
    JOIN "parent_student_relationships" r ON r."student_user_id"=m."user_id"
      AND r."parent_user_id"=${actor.userId}
      AND r."status"='ACTIVE' AND r."approved_at" IS NOT NULL AND r."revoked_at" IS NULL
    JOIN "campus_activities" a ON a."course_id"=c."course_id" AND a."status"='OPEN'
    JOIN "courses" course ON course."id"=a."course_id"
    WHERE c."withdrawn_at" IS NULL
    ORDER BY c."course_id" LIMIT 50
  `
  return {list:rows,policy:campusPeerDisclosure()}
}

/** One batched student inbox projection for voluntary peer activities. No
 * classmates' names or responses are exposed before consent or allocation.
 */
export async function campusPeerOpportunities(actor:AuthenticatedPrincipal){
  if(actor.accountDomain!=='SCHOOL'||actor.role!=='STUDENT')
    fail('CAMPUS_STUDENT_REQUIRED')
  const rows=await prisma.$queryRaw<Array<{
    courseId:string;organizationId:string;title:string;assented:boolean;guardianConsented:boolean
  }>>`
    SELECT a."course_id" AS "courseId",
      a."organization_id" AS "organizationId",course."title",
      (c."assented_at" IS NOT NULL AND c."withdrawn_at" IS NULL) AS "assented",
      (c."guardian_consented_at" IS NOT NULL AND c."withdrawn_at" IS NULL
        AND guardian."status"='ACTIVE' AND guardian."revoked_at" IS NULL) AS "guardianConsented"
    FROM "campus_activity_participants" p
    JOIN "campus_activities" a ON a."course_id"=p."course_id"
      AND a."organization_id"=p."organization_id" AND a."status"='OPEN'
    JOIN "courses" course ON course."id"=a."course_id"
    JOIN "organizations" o ON o."id"=a."organization_id"
      AND o."product_domain"='SCHOOL' AND o."status"='ACTIVE'
    JOIN "organization_memberships" m ON m."id"=p."membership_id"
      AND m."organization_id"=p."organization_id" AND m."user_id"=${actor.userId}
      AND m."valid_from"<=statement_timestamp()
      AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
    JOIN "campus_student_enrollments" e ON e."user_id"=m."user_id"
      AND e."organization_id"=m."organization_id" AND e."status"='APPROVED'
    JOIN "campus_class_admissions" ca ON ca."organization_id"=e."organization_id"
      AND ca."class_unit_id"=e."class_unit_id" AND ca."status"='APPROVED'
    JOIN "organization_student_class_assignments" sc ON sc."membership_id"=m."id"
      AND sc."organization_id"=m."organization_id" AND sc."class_unit_id"=e."class_unit_id"
      AND sc."valid_from"<=statement_timestamp()
      AND (sc."valid_until" IS NULL OR sc."valid_until">statement_timestamp())
    JOIN "organization_persona_grants" pg ON pg."membership_id"=m."id"
      AND pg."organization_id"=m."organization_id" AND pg."persona"='STUDENT'
      AND pg."revoked_at" IS NULL
    JOIN "users" u ON u."id"=m."user_id" AND u."account_domain"='SCHOOL'
      AND u."role"='STUDENT' AND u."is_active"=TRUE AND u."is_frozen"=FALSE
    LEFT JOIN "campus_peer_consents" c ON c."organization_id"=m."organization_id"
      AND c."course_id"=a."course_id" AND c."membership_id"=m."id"
    LEFT JOIN "parent_student_relationships" guardian
      ON guardian."id"=c."guardian_relationship_id"
      AND guardian."student_user_id"=m."user_id"
    WHERE p."status"='ACTIVE'
      AND NOT EXISTS(SELECT 1 FROM "organization_access_denies" deny
        WHERE deny."organization_id"=m."organization_id" AND deny."user_id"=m."user_id"
          AND deny."lifted_at" IS NULL
          AND deny."permission" IN ('*','ACTIVITY_READ','RUN_START','PEER_ASSESS'))
    ORDER BY a."course_id" DESC LIMIT 51
  `
  return {list:rows.slice(0,50),truncated:rows.length>50,
    policy:campusPeerDisclosure()}
}
