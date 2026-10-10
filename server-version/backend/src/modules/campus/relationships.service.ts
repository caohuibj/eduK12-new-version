import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import { resolveOrganizationAccessContext } from '../organization/access'
import { appendAudit } from '../organization/service'
import { assertCurrentMembershipPersona } from '../organization/classRelationships'
import { OrganizationDomainError } from '../organization/types'
import { CampusAdmissionError } from './admission.service'
import { campusStudentReference } from './studentReference'

const deny=(code:string,status=403):never=>{throw new CampusAdmissionError(code,status)}
type Database=Prisma.TransactionClient|typeof prisma

/** Governance of professional relationships is separate from professional
 * access to any student's report: ORG_ADMIN is a writer, not a reader.
 */
async function schoolGovernor(db:Database,actor:AuthenticatedPrincipal,organizationId:string) {
  if(actor.accountDomain!=='SCHOOL')deny('CAMPUS_SCHOOL_ACCOUNT_REQUIRED')
  const ctx=await resolveOrganizationAccessContext({principal:actor,organizationId},
    db===prisma?undefined:db as Prisma.TransactionClient)
  if(!ctx||ctx.productDomain!=='SCHOOL'||ctx.organizationStatus!=='ACTIVE'
    ||!ctx.membershipId||ctx.orgRole!=='ORG_ADMIN'||!ctx.canGovern)
    deny('CAMPUS_RELATION_GOVERNOR_REQUIRED')
  return ctx
}

export async function readCampusRelationshipDirectory(input:{
  actor:AuthenticatedPrincipal;organizationId:string;classUnitId?:string
}){
  await schoolGovernor(prisma,input.actor,input.organizationId)
  const cls=input.classUnitId??null
  const [staff,students,staffAssignments,clientRelationships]=await Promise.all([
    prisma.$queryRaw<Array<{membershipId:string;displayName:string;canTeach:boolean;canCounsel:boolean;hasPsychology:boolean}>>`
      SELECT m.id AS "membershipId",ca.login_name AS "displayName",
        EXISTS(SELECT 1 FROM organization_persona_grants p WHERE p.organization_id=m.organization_id
          AND p.membership_id=m.id AND p.persona='TEACHER' AND p.revoked_at IS NULL) AS "canTeach",
        EXISTS(SELECT 1 FROM organization_persona_grants p WHERE p.organization_id=m.organization_id
          AND p.membership_id=m.id AND p.persona='COUNSELOR' AND p.revoked_at IS NULL) AS "canCounsel",
        EXISTS(SELECT 1 FROM organization_capability_grants c WHERE c.organization_id=m.organization_id
          AND c.membership_id=m.id AND c.capability='PSYCHOLOGY_STAFF' AND c.revoked_at IS NULL) AS "hasPsychology"
      FROM organization_memberships m
      JOIN users u ON u.id=m.user_id AND u.account_domain='SCHOOL'
        AND u.role IN ('TEACHER','ADMIN') AND u.is_active=TRUE AND u.is_frozen=FALSE
      JOIN campus_accounts ca ON ca.user_id=m.user_id
      WHERE m.organization_id=${input.organizationId}
        AND m.valid_from<=statement_timestamp()
        AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
        AND EXISTS(SELECT 1 FROM organization_persona_grants p
          WHERE p.organization_id=m.organization_id AND p.membership_id=m.id
            AND p.persona IN ('TEACHER','COUNSELOR') AND p.revoked_at IS NULL)
      ORDER BY ca.login_name,m.id LIMIT 201
    `,
    cls?prisma.$queryRaw<Array<{membershipId:string;userId:string}>>`
      SELECT m.id AS "membershipId",m.user_id AS "userId"
      FROM campus_student_enrollments e
      JOIN campus_class_admissions admission ON admission.organization_id=e.organization_id
        AND admission.class_unit_id=e.class_unit_id AND admission.status='APPROVED'
      JOIN organization_memberships m ON m.organization_id=e.organization_id
        AND m.user_id=e.user_id
        AND m.valid_from<=statement_timestamp()
        AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
      JOIN organization_student_class_assignments sc ON sc.organization_id=e.organization_id
        AND sc.membership_id=m.id AND sc.class_unit_id=e.class_unit_id
        AND sc.valid_from<=statement_timestamp()
        AND (sc.valid_until IS NULL OR sc.valid_until>statement_timestamp())
      JOIN organization_persona_grants p ON p.organization_id=e.organization_id
        AND p.membership_id=m.id AND p.persona='STUDENT' AND p.revoked_at IS NULL
      JOIN users u ON u.id=m.user_id AND u.account_domain='SCHOOL' AND u.role='STUDENT'
        AND u.is_active=TRUE AND u.is_frozen=FALSE
      WHERE e.organization_id=${input.organizationId} AND e.class_unit_id=${cls}
        AND e.status='APPROVED'
      ORDER BY m.id LIMIT 501
    `:Promise.resolve([] as Array<{membershipId:string;userId:string}>),
    prisma.$queryRaw<Array<{id:string;membershipId:string;classUnitId:string;staffRole:string}>>`
      SELECT id,membership_id AS "membershipId",class_unit_id AS "classUnitId",
        staff_role AS "staffRole"
      FROM organization_staff_class_assignments
      WHERE organization_id=${input.organizationId}
        AND valid_from<=statement_timestamp()
        AND (valid_until IS NULL OR valid_until>statement_timestamp())
        AND (${cls}::text IS NULL OR class_unit_id=${cls})
      ORDER BY valid_from DESC,id DESC LIMIT 101
    `,
    prisma.$queryRaw<Array<{id:string;counselorMembershipId:string;clientMembershipId:string;studentUserId:string}>>`
      SELECT r.id,r.counselor_membership_id AS "counselorMembershipId",
        r.client_membership_id AS "clientMembershipId",m.user_id AS "studentUserId"
      FROM organization_counselor_client_relationships r
      JOIN organization_memberships m ON m.id=r.client_membership_id
        AND m.organization_id=r.organization_id
      WHERE r.organization_id=${input.organizationId}
        AND r.valid_from<=statement_timestamp()
        AND (r.valid_until IS NULL OR r.valid_until>statement_timestamp())
        AND (${cls}::text IS NULL OR EXISTS(
          SELECT 1 FROM campus_student_enrollments e
          WHERE e.organization_id=r.organization_id AND e.user_id=m.user_id
            AND e.class_unit_id=${cls} AND e.status='APPROVED'))
      ORDER BY r.valid_from DESC,r.id DESC LIMIT 101
    `,
  ])
  return {
    staff:staff.slice(0,200),
    students:students.slice(0,500).map(s=>({
      membershipId:s.membershipId,reference:campusStudentReference(input.organizationId,s.userId),
    })),
    staffAssignments:staffAssignments.slice(0,100),
    clientRelationships:clientRelationships.slice(0,100).map(r=>({
      id:r.id,counselorMembershipId:r.counselorMembershipId,
      clientMembershipId:r.clientMembershipId,
      studentReference:campusStudentReference(input.organizationId,r.studentUserId),
    })),
    truncated:{staff:staff.length>200,students:students.length>500,
      staffAssignments:staffAssignments.length>100,
      clientRelationships:clientRelationships.length>100},
  }
}

/** Explicitly appoint a counseling case. Class admission grants STUDENT, not
 * CLIENT; this transaction grants CLIENT only to a currently approved pupil,
 * verifies the counselor's distinct psychology capability, then binds the
 * existing relationship without bypassing the canonical reporting reader.
 */
export async function appointCampusCounselorClient(input:{
  actor:AuthenticatedPrincipal;organizationId:string
  counselorMembershipId:string;clientMembershipId:string
}){
  if(input.counselorMembershipId===input.clientMembershipId)
    deny('CAMPUS_RELATION_DISTINCT_REQUIRED',400)
  try{
    return await prisma.$transaction(async tx=>{
      await schoolGovernor(tx,input.actor,input.organizationId)
      const counselor=await tx.$queryRaw<Array<{id:string;userId:string}>>`
        SELECT m.id,m.user_id AS "userId" FROM organization_memberships m
        JOIN users u ON u.id=m.user_id AND u.account_domain='SCHOOL'
          AND u.is_active=TRUE AND u.is_frozen=FALSE
        JOIN organization_persona_grants p ON p.organization_id=m.organization_id
          AND p.membership_id=m.id AND p.persona='COUNSELOR' AND p.revoked_at IS NULL
        JOIN organization_capability_grants cap ON cap.organization_id=m.organization_id
          AND cap.membership_id=m.id AND cap.capability='PSYCHOLOGY_STAFF' AND cap.revoked_at IS NULL
        WHERE m.organization_id=${input.organizationId} AND m.id=${input.counselorMembershipId}
          AND m.valid_from<=statement_timestamp()
          AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
          AND NOT EXISTS(SELECT 1 FROM organization_access_denies d
            WHERE d.organization_id=m.organization_id AND d.user_id=m.user_id AND d.lifted_at IS NULL
              AND d.permission IN ('*','PSYCHOLOGY_STAFF','REPORT_READ'))
        LIMIT 1 FOR SHARE OF m
      `
      if(!counselor.length)deny('CAMPUS_COUNSELOR_NOT_ELIGIBLE')
      // A dual-role school administrator must never grant themselves a new
      // CLIENT relationship and thereby expand their own sensitive report scope.
      if(counselor[0].userId===input.actor.userId)deny('CAMPUS_CASE_SELF_APPOINTMENT')
      const student=await tx.$queryRaw<Array<{userId:string}>>`
        SELECT m.user_id AS "userId" FROM organization_memberships m
        JOIN users u ON u.id=m.user_id AND u.account_domain='SCHOOL'
          AND u.role='STUDENT' AND u.is_active=TRUE AND u.is_frozen=FALSE
        JOIN campus_student_enrollments e ON e.organization_id=m.organization_id
          AND e.user_id=m.user_id AND e.status='APPROVED'
        JOIN campus_class_admissions a ON a.organization_id=e.organization_id
          AND a.class_unit_id=e.class_unit_id AND a.status='APPROVED'
        JOIN organization_student_class_assignments sc ON sc.organization_id=m.organization_id
          AND sc.membership_id=m.id AND sc.class_unit_id=e.class_unit_id
          AND sc.valid_from<=statement_timestamp()
          AND (sc.valid_until IS NULL OR sc.valid_until>statement_timestamp())
        JOIN organization_persona_grants p ON p.organization_id=m.organization_id
          AND p.membership_id=m.id AND p.persona='STUDENT' AND p.revoked_at IS NULL
        WHERE m.organization_id=${input.organizationId} AND m.id=${input.clientMembershipId}
          AND m.valid_from<=statement_timestamp()
          AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
        LIMIT 1 FOR SHARE OF m
      `
      if(!student.length)deny('CAMPUS_CLIENT_NOT_APPROVED')
      const exists=await tx.organizationPersonaGrant.findFirst({where:{
        organizationId:input.organizationId,membershipId:input.clientMembershipId,
        persona:'CLIENT',revokedAt:null,
      },select:{id:true}})
      if(!exists)await tx.organizationPersonaGrant.create({data:{
        id:randomUUID(),organizationId:input.organizationId,
        membershipId:input.clientMembershipId,persona:'CLIENT',
        grantedByUserId:input.actor.userId,
      }})
      const id=randomUUID()
      await tx.$executeRaw`
        INSERT INTO organization_counselor_client_relationships
          (id,organization_id,counselor_membership_id,client_membership_id)
        VALUES (${id},${input.organizationId},${input.counselorMembershipId},${input.clientMembershipId})
      `
      await appendAudit(tx,{organizationId:input.organizationId,
        actorUserId:input.actor.userId,action:'CAMPUS_COUNSELOR_CLIENT_APPOINTED',
        targetType:'COUNSELOR_CLIENT_RELATIONSHIP',targetId:id,
        domainEventId:randomUUID(),payload:{
          counselorMembershipId:input.counselorMembershipId,
          clientMembershipId:input.clientMembershipId,
        }})
      return {id,status:'ACTIVE' as const,
        studentReference:campusStudentReference(input.organizationId,student[0].userId)}
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
  }catch(error:any){
    if(error instanceof CampusAdmissionError)throw error
    if(['P2002','P2034'].includes(error?.code)
      || ['23505','40001'].includes(error?.meta?.code))
      deny('CAMPUS_RELATION_CONFLICT',409)
    throw error
  }
}

export async function endCampusCounselorClient(input:{
  actor:AuthenticatedPrincipal;organizationId:string;relationshipId:string;reason:string
}){
  return prisma.$transaction(async tx=>{
    await schoolGovernor(tx,input.actor,input.organizationId)
    const rows=await tx.$queryRaw<Array<{id:string}>>`
      UPDATE organization_counselor_client_relationships
      SET valid_until=statement_timestamp()
      WHERE id=${input.relationshipId} AND organization_id=${input.organizationId}
        AND valid_until IS NULL RETURNING id
    `
    if(!rows.length)deny('CAMPUS_RELATION_NOT_FOUND',404)
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actor.userId,action:'CAMPUS_COUNSELOR_CLIENT_ENDED',
      targetType:'COUNSELOR_CLIENT_RELATIONSHIP',targetId:input.relationshipId,
      domainEventId:randomUUID(),payload:{reason:input.reason}})
    return {ended:true}
  })
}

export async function assignCampusStaffClass(input:{
  actor:AuthenticatedPrincipal;organizationId:string
  membershipId:string;classUnitId:string;staffRole:'HOMEROOM'|'TEACHING'
}){
  try{
    return await prisma.$transaction(async tx=>{
      await schoolGovernor(tx,input.actor,input.organizationId)
      try{
        await assertCurrentMembershipPersona(tx,{
          organizationId:input.organizationId,membershipId:input.membershipId,persona:'TEACHER',
        })
      }catch(error){
        if(error instanceof OrganizationDomainError)deny('CAMPUS_TEACHER_MEMBERSHIP_REQUIRED')
        throw error
      }
      const classes=await tx.$queryRaw<Array<{id:string}>>`
        SELECT id FROM organization_units
        WHERE organization_id=${input.organizationId} AND id=${input.classUnitId}
          AND unit_kind='CLASS' LIMIT 1 FOR SHARE
      `
      if(!classes.length)deny('CAMPUS_CLASS_NOT_FOUND',404)
      const id=randomUUID()
      const rows=await tx.$queryRaw<Array<{
        id:string;organizationId:string;membershipId:string;classUnitId:string;staffRole:string
      }>>`
        INSERT INTO organization_staff_class_assignments(
          id,organization_id,membership_id,class_unit_id,staff_role
        ) VALUES (
          ${id},${input.organizationId},${input.membershipId},${input.classUnitId},${input.staffRole}
        ) RETURNING id,organization_id AS "organizationId",
          membership_id AS "membershipId",class_unit_id AS "classUnitId",staff_role AS "staffRole"
      `
      await appendAudit(tx,{
        organizationId:input.organizationId,actorUserId:input.actor.userId,
        action:'CAMPUS_STAFF_CLASS_ASSIGNED',targetType:'STAFF_CLASS_ASSIGNMENT',targetId:id,
        domainEventId:randomUUID(),
        payload:{membershipId:input.membershipId,classUnitId:input.classUnitId,staffRole:input.staffRole},
      })
      return rows[0]
    })
  }catch(error:any){
    if(error instanceof CampusAdmissionError)throw error
    if(error?.code==='P2002'||error?.meta?.code==='23505')
      deny('CAMPUS_STAFF_CLASS_CONFLICT',409)
    throw error
  }
}

export async function endCampusStaffClass(input:{
  actor:AuthenticatedPrincipal;organizationId:string;assignmentId:string
}){
  return prisma.$transaction(async tx=>{
    await schoolGovernor(tx,input.actor,input.organizationId)
    const rows=await tx.$queryRaw<Array<{
      id:string;organizationId:string;membershipId:string;classUnitId:string;staffRole:string
    }>>`
      UPDATE organization_staff_class_assignments
      SET valid_until=statement_timestamp()
      WHERE organization_id=${input.organizationId} AND id=${input.assignmentId}
        AND valid_until IS NULL
      RETURNING id,organization_id AS "organizationId",membership_id AS "membershipId",
        class_unit_id AS "classUnitId",staff_role AS "staffRole"
    `
    if(!rows.length)deny('CAMPUS_STAFF_CLASS_NOT_FOUND',404)
    await appendAudit(tx,{
      organizationId:input.organizationId,actorUserId:input.actor.userId,
      action:'CAMPUS_STAFF_CLASS_ENDED',targetType:'STAFF_CLASS_ASSIGNMENT',
      targetId:input.assignmentId,domainEventId:randomUUID(),
      payload:{membershipId:rows[0].membershipId,classUnitId:rows[0].classUnitId,
        staffRole:rows[0].staffRole},
    })
    return rows[0]
  })
}
