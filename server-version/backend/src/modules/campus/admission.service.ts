import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { Prisma, UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { hashPassword } from '../../utils/password'
import { appendAudit } from '../organization/service'
import { resolveOrganizationAccessContext } from '../organization/access'
import type { AuthenticatedPrincipal } from '../../types'

type Tx = Prisma.TransactionClient
type AdmissionRow = {
  classUnitId: string; organizationId: string; rosterVersion: number
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'APPROVED'
  windowClosesAt: Date | null
}
type EligibilityRow = { id: string; rosterVersion: number }
type CodeRow = { id: string; rosterVersion: number }

export class CampusAdmissionError extends Error {
  constructor(public readonly code: string, public readonly statusCode = 409) {
    super(code)
    this.name = 'CampusAdmissionError'
  }
}
const fail = (code: string, statusCode = 409): never => { throw new CampusAdmissionError(code, statusCode) }
const scoped = (value: string) => value.trim()
const normalizeNo = (value: string) => {
  const normalized = scoped(value).toUpperCase()
  if (!/^[A-Z0-9_-]{2,40}$/.test(normalized)) fail('INVALID_ELIGIBILITY', 400)
  return normalized
}
const normalizeLogin = (value: string) => {
  const normalized = scoped(value).toLowerCase()
  if (!/^[a-z0-9_.-]{4,32}$/.test(normalized)) fail('INVALID_LOGIN', 400)
  return normalized
}
export function digestCampusStudentNumber(organizationId: string, studentNumber: string): string {
  const hex = process.env.CAMPUS_ELIGIBILITY_HMAC_KEY
  if (!hex || !/^[a-fA-F0-9]{64}$/.test(hex)) fail('CAMPUS_KEY_NOT_CONFIGURED', 503)
  return createHmac('sha256', Buffer.from(hex!, 'hex'))
    .update('HUISCHOOL:ELIGIBILITY:v1\x00')
    .update(organizationId).update('\x00').update(normalizeNo(studentNumber))
    .digest('hex')
}
const digestCode = (code: string) => createHash('sha256').update(code).digest('hex')

async function admissionForUpdate(tx: Tx, orgId: string, classId: string): Promise<AdmissionRow> {
  const rows = await tx.$queryRaw<AdmissionRow[]>`
    SELECT "class_unit_id" AS "classUnitId", "organization_id" AS "organizationId",
      "roster_version" AS "rosterVersion", "status",
      "window_closes_at" AS "windowClosesAt"
    FROM "campus_class_admissions"
    WHERE "class_unit_id" = ${classId} AND "organization_id" = ${orgId}
    FOR UPDATE
  `
  return rows[0] ?? fail('CLASS_ADMISSION_NOT_FOUND', 404)
}

/** Current campus organization membership, never a legacy User.role shortcut. */
export async function assertCampusGovernance(actor: AuthenticatedPrincipal, organizationId: string) {
  if (actor.accountDomain !== 'SCHOOL') fail('CAMPUS_ACCOUNT_REQUIRED', 403)
  const context = await resolveOrganizationAccessContext({ principal: actor, organizationId })
  if (!context?.canGovern || !context.membershipId) fail('CAMPUS_GOVERNANCE_REQUIRED', 403)
  return context!
}

/** Psychological staff approval must not be implied by ORG_ADMIN. */
export async function assertCampusPsychologyStaff(actor: AuthenticatedPrincipal, organizationId: string) {
  if (actor.accountDomain !== 'SCHOOL') fail('CAMPUS_ACCOUNT_REQUIRED', 403)
  const context = await resolveOrganizationAccessContext({ principal: actor, organizationId })
  if (!context?.membershipId || context.organizationStatus !== 'ACTIVE'
    || context.explicitDenies.some(x => ['*', 'PSYCHOLOGY_STAFF', 'CLASS_APPROVE'].includes(x))
    || !context.capabilities.includes('PSYCHOLOGY_STAFF')) {
    fail('PSYCHOLOGY_STAFF_REQUIRED', 403)
  }
  return context!
}

/** A recovery officer is a current SCHOOL admin or separately authorized
 * psychology staff member; homeroom/teacher/course ownership never qualify.
 */
export async function assertCampusRecoveryAuthority(actor: AuthenticatedPrincipal, organizationId: string) {
  if (actor.accountDomain !== 'SCHOOL') fail('CAMPUS_ACCOUNT_REQUIRED', 403)
  const context = await resolveOrganizationAccessContext({ principal: actor, organizationId })
  if (!context || context.productDomain !== 'SCHOOL' || !context.membershipId
      || context.organizationStatus !== 'ACTIVE'
      || context.explicitDenies.some(d => ['*','STUDENT_RECOVERY','CLASS_APPROVE','ORGANIZATION_GOVERNANCE'].includes(d))
      || !(context.orgRole === 'ORG_ADMIN'
           || (context.capabilities.includes('PSYCHOLOGY_STAFF') && context.personas.includes('COUNSELOR')))) {
    fail('CAMPUS_RECOVERY_AUTH_REQUIRED', 403)
  }
  return context
}

export async function replaceCampusRoster(input: {
  actor: AuthenticatedPrincipal; organizationId: string; classUnitId: string
  studentNumbers: string[]
}) {
  await assertCampusGovernance(input.actor, input.organizationId)
  const nums = input.studentNumbers.map(normalizeNo)
  if (!nums.length || nums.length > 5000 || new Set(nums).size !== nums.length) {
    fail('ROSTER_SIZE_OR_DUPLICATES', 400)
  }
  const digests = nums.map(num => digestCampusStudentNumber(input.organizationId, num))
  return prisma.$transaction(async (tx) => {
    // A class admission row is the concurrency lock for roster/window/claims.
    await tx.$executeRaw`
      INSERT INTO "campus_class_admissions" ("class_unit_id", "organization_id")
      VALUES (${input.classUnitId}, ${input.organizationId})
      ON CONFLICT ("class_unit_id") DO NOTHING
    `
    const row = await admissionForUpdate(tx, input.organizationId, input.classUnitId)
    if (row.status === 'OPEN' || row.status === 'APPROVED') fail('ROSTER_FROZEN')
    const claimed = await tx.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "campus_student_eligibilities"
      WHERE "organization_id"=${input.organizationId} AND "class_unit_id"=${input.classUnitId}
        AND "claimed_user_id" IS NOT NULL
    `
    if (claimed[0]?.count) fail('ROSTER_HAS_REGISTRATIONS')
    const version = row.rosterVersion + 1
    // Never record plaintext student numbers. Unique by school, even across
    // classrooms, so accidental duplicate school identities fail atomically.
    const colliding = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "campus_student_eligibilities"
      WHERE "organization_id"=${input.organizationId}
        AND "class_unit_id"<>${input.classUnitId}
        AND "student_no_digest" IN (${Prisma.join(digests)})
      LIMIT 1
    `)
    if (colliding.length) fail('ROSTER_ELIGIBILITY_CONFLICT')
    await tx.$executeRaw`
      UPDATE "campus_student_eligibilities" SET "status"='VOID'
      WHERE "organization_id"=${input.organizationId}
        AND "class_unit_id"=${input.classUnitId}
        AND "claimed_user_id" IS NULL
    `
    const rows = digests.map(digest => Prisma.sql`(
      ${randomUUID()}, ${input.organizationId}, ${input.classUnitId},
      ${digest}, 1, ${version}, 'VALID'
    )`)
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "campus_student_eligibilities" (
        "id", "organization_id", "class_unit_id",
        "student_no_digest", "key_version", "roster_version", "status"
      ) VALUES ${Prisma.join(rows)}
      ON CONFLICT ("organization_id", "student_no_digest")
      DO UPDATE SET "status"='VALID', "roster_version"=EXCLUDED."roster_version"
      WHERE "campus_student_eligibilities"."claimed_user_id" IS NULL
        AND "campus_student_eligibilities"."class_unit_id"=EXCLUDED."class_unit_id"
    `)
    await tx.$executeRaw`
      UPDATE "campus_activation_codes" SET "revoked_at"=statement_timestamp()
      WHERE "organization_id"=${input.organizationId}
        AND "class_unit_id"=${input.classUnitId}
        AND "consumed_at" IS NULL AND "revoked_at" IS NULL
    `
    await tx.$executeRaw`
      UPDATE "campus_class_admissions"
      SET "roster_version"=${version}, "status"='DRAFT',
          "window_opens_at"=NULL, "window_closes_at"=NULL,
          "updated_at"=statement_timestamp()
      WHERE "class_unit_id"=${input.classUnitId}
    `
    await appendAudit(tx, {
      organizationId: input.organizationId, actorUserId: input.actor.userId,
      action: 'CAMPUS_ROSTER_REPLACED', targetType: 'CLASS', targetId: input.classUnitId,
      domainEventId: randomUUID(), payload: { version, count: digests.length },
    })
    return { rosterVersion: version, eligibleCount: digests.length, status: 'DRAFT' as const }
  })
}

export async function setCampusRegistrationWindow(input: {
  actor: AuthenticatedPrincipal; organizationId: string; classUnitId: string
  action: 'OPEN' | 'CLOSE'; closesAt?: Date
}) {
  await assertCampusGovernance(input.actor, input.organizationId)
  return prisma.$transaction(async tx => {
    const row = await admissionForUpdate(tx, input.organizationId, input.classUnitId)
    if (input.action === 'OPEN') {
      if (!['DRAFT', 'CLOSED'].includes(row.status)
        || !input.closesAt || input.closesAt <= new Date()
        || input.closesAt.getTime() > Date.now() + 30 * 86400_000) fail('WINDOW_INVALID')
      await tx.$executeRaw`
        UPDATE "campus_class_admissions"
        SET "status"='OPEN', "window_opens_at"=statement_timestamp(),
            "window_closes_at"=${input.closesAt}, "updated_at"=statement_timestamp()
        WHERE "class_unit_id"=${input.classUnitId}
      `
    } else {
      if (row.status !== 'OPEN') fail('WINDOW_NOT_OPEN')
      await tx.$executeRaw`
        UPDATE "campus_class_admissions"
        SET "status"='CLOSED', "updated_at"=statement_timestamp()
        WHERE "class_unit_id"=${input.classUnitId}
      `
    }
    await appendAudit(tx, {
      organizationId: input.organizationId, actorUserId: input.actor.userId,
      action: 'CAMPUS_REGISTRATION_WINDOW_'+input.action,
      targetType: 'CLASS', targetId: input.classUnitId,
      domainEventId: randomUUID(), payload: { rosterVersion: row.rosterVersion },
    })
    return { status: input.action === 'OPEN' ? 'OPEN' : 'CLOSED' }
  })
}

export async function issueCampusActivationCodes(input: {
  actor: AuthenticatedPrincipal; organizationId: string; classUnitId: string
  count: number; ttlMinutes: number
}) {
  await assertCampusGovernance(input.actor, input.organizationId)
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 500
    || !Number.isInteger(input.ttlMinutes) || input.ttlMinutes < 5 || input.ttlMinutes > 10080) fail('CODE_BATCH_INVALID',400)
  return prisma.$transaction(async tx => {
    const row = await admissionForUpdate(tx, input.organizationId, input.classUnitId)
    if (!['DRAFT','OPEN'].includes(row.status)) fail('CODE_WINDOW_CLOSED')
    const expiry = new Date(Math.min(
      Date.now()+input.ttlMinutes*60_000,
      row.windowClosesAt?.getTime() ?? Number.MAX_SAFE_INTEGER,
    ))
    if (expiry <= new Date()) fail('CODE_WINDOW_CLOSED')
    const codes = Array.from({length:input.count},()=>randomBytes(20).toString('base64url'))
    const rows = codes.map(code => Prisma.sql`(
      ${randomUUID()}, ${input.organizationId}, ${input.classUnitId},
      ${row.rosterVersion}, ${digestCode(code)}, ${expiry}
    )`)
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "campus_activation_codes" (
        "id", "organization_id", "class_unit_id", "roster_version",
        "code_digest", "expires_at"
      ) VALUES ${Prisma.join(rows)}
    `)
    await appendAudit(tx, {
      organizationId: input.organizationId, actorUserId: input.actor.userId,
      action: 'CAMPUS_CODES_ISSUED', targetType: 'CLASS', targetId: input.classUnitId,
      domainEventId: randomUUID(), payload: { count:codes.length, rosterVersion:row.rosterVersion, expiresAt:expiry.toISOString() },
    })
    // Returned only once; never in audit or database, and response is no-store.
    return { codes, expiresAt:expiry.toISOString(), rosterVersion:row.rosterVersion }
  })
}

export async function registerCampusStudent(input: {
  organizationId: string; classUnitId: string; studentNumber: string
  activationCode: string; username: string; password: string
}) {
  const normalizedLogin=normalizeLogin(input.username)
  const normalizedNumber=normalizeNo(input.studentNumber)
  if (input.activationCode.length < 24 || input.activationCode.length > 64) fail('CAMPUS_REGISTRATION_INVALID',400)
  const studentNoDigest=digestCampusStudentNumber(input.organizationId,normalizedNumber)
  const codeDigest=digestCode(input.activationCode)
  const passwordHash=await hashPassword(input.password)
  try {
    return await prisma.$transaction(async tx => {
      const row=await admissionForUpdate(tx,input.organizationId,input.classUnitId)
      if (row.status!=='OPEN' || !row.windowClosesAt || row.windowClosesAt<=new Date()) fail('CAMPUS_REGISTRATION_UNAVAILABLE')
      const codes=await tx.$queryRaw<CodeRow[]>`
        SELECT "id", "roster_version" AS "rosterVersion" FROM "campus_activation_codes"
        WHERE "organization_id"=${input.organizationId} AND "class_unit_id"=${input.classUnitId}
          AND "code_digest"=${codeDigest} AND "expires_at">statement_timestamp()
          AND "revoked_at" IS NULL AND "consumed_at" IS NULL
        FOR UPDATE
      `
      const eligible=await tx.$queryRaw<EligibilityRow[]>`
        SELECT "id", "roster_version" AS "rosterVersion" FROM "campus_student_eligibilities"
        WHERE "organization_id"=${input.organizationId} AND "class_unit_id"=${input.classUnitId}
          AND "student_no_digest"=${studentNoDigest} AND "key_version"=1
          AND "status"='VALID' AND "claimed_user_id" IS NULL
        FOR UPDATE
      `
      if (!codes[0] || !eligible[0] || codes[0].rosterVersion!==row.rosterVersion
        || eligible[0].rosterVersion!==row.rosterVersion) fail('CAMPUS_REGISTRATION_UNAVAILABLE')
      const user=await tx.user.create({data:{
        username:'huischool_'+randomUUID().replace(/-/g,''),
        passwordHash, role:UserRole.STUDENT, accountDomain:'SCHOOL',
        nickname:null, phone:null, teacherApproved:true,
      }})
      await tx.campusAccount.create({data:{
        userId:user.id, loginName:scoped(input.username), normalizedLogin,
      }})
      await tx.$executeRaw`
        UPDATE "campus_student_eligibilities"
        SET "claimed_user_id"=${user.id}
        WHERE "id"=${eligible[0].id} AND "claimed_user_id" IS NULL
      `
      await tx.$executeRaw`
        UPDATE "campus_activation_codes"
        SET "consumed_at"=statement_timestamp(), "consumed_user_id"=${user.id}
        WHERE "id"=${codes[0].id} AND "consumed_at" IS NULL
      `
      await tx.$executeRaw`
        INSERT INTO "campus_student_enrollments" (
          "user_id","organization_id","class_unit_id","eligibility_id","roster_version"
        ) VALUES (${user.id},${input.organizationId},${input.classUnitId},${eligible[0].id},${row.rosterVersion})
      `
      // No OrganizationMembership/Persona is created until whole-class approval.
      return { userId:user.id, status:'PENDING_CLASS_APPROVAL' as const }
    })
  } catch(cause:any) {
    if (cause instanceof CampusAdmissionError) throw cause
    if (['P2002','23505','P2010'].includes(cause?.code)
      || cause?.meta?.code === '23505') fail('CAMPUS_REGISTRATION_UNAVAILABLE')
    throw cause
  }
}

export async function readCampusClassSummary(input: {
  actor: AuthenticatedPrincipal; organizationId: string; classUnitId: string
}) {
  const context=await assertCampusGovernance(input.actor,input.organizationId)
  if (!context.membershipId) fail('CAMPUS_GOVERNANCE_REQUIRED',403)
  const rows=await prisma.$queryRaw<Array<{
    status:string; rosterVersion:number; eligibleCount:number
    registeredCount:number; unresolvedIncidents:number
  }>>`
    SELECT a."status",a."roster_version" AS "rosterVersion",
      (SELECT COUNT(*)::int FROM "campus_student_eligibilities" e
       WHERE e."class_unit_id"=a."class_unit_id" AND e."status"='VALID'
         AND e."roster_version"=a."roster_version") AS "eligibleCount",
      (SELECT COUNT(*)::int FROM "campus_student_enrollments" s
       WHERE s."class_unit_id"=a."class_unit_id"
         AND s."roster_version"=a."roster_version"
         AND s."status" IN ('PENDING_CLASS_APPROVAL','APPROVED')) AS "registeredCount",
      (SELECT COUNT(*)::int FROM "campus_admission_incidents" i
       WHERE i."class_unit_id"=a."class_unit_id"
         AND i."resolved_at" IS NULL) AS "unresolvedIncidents"
    FROM "campus_class_admissions" a
    WHERE a."organization_id"=${input.organizationId} AND a."class_unit_id"=${input.classUnitId}
  `
  return rows[0] ?? fail('CLASS_ADMISSION_NOT_FOUND',404)
}

export async function approveCampusClass(input: {
  actor: AuthenticatedPrincipal; organizationId: string; classUnitId: string
  expectedRosterVersion: number
}) {
  const context=await assertCampusPsychologyStaff(input.actor,input.organizationId)
  return prisma.$transaction(async tx=>{
    const row=await admissionForUpdate(tx,input.organizationId,input.classUnitId)
    if (row.status!=='CLOSED' || row.rosterVersion!==input.expectedRosterVersion) fail('APPROVAL_PRECONDITION_FAILED')
    const numbers=await tx.$queryRaw<Array<{ eligible:number; registered:number; unresolved:number }>>`
      SELECT
        (SELECT COUNT(*)::int FROM "campus_student_eligibilities" e
         WHERE e."class_unit_id"=${input.classUnitId} AND e."status"='VALID'
         AND e."roster_version"=${row.rosterVersion}) AS "eligible",
        (SELECT COUNT(*)::int FROM "campus_student_enrollments" s
         WHERE s."class_unit_id"=${input.classUnitId} AND s."roster_version"=${row.rosterVersion}
         AND s."status"='PENDING_CLASS_APPROVAL') AS "registered",
        (SELECT COUNT(*)::int FROM "campus_admission_incidents" i
         WHERE i."class_unit_id"=${input.classUnitId} AND i."resolved_at" IS NULL) AS "unresolved"
    `
    const v=numbers[0]
    if(!v || v.eligible===0 || v.eligible!==v.registered || v.unresolved!==0) fail('CLASS_NOT_READY')
    const members=await tx.$queryRaw<Array<{ id:string; userId:string }>>`
      INSERT INTO "organization_memberships" ("id","organization_id","user_id","org_role")
      SELECT gen_random_uuid()::text,s."organization_id",s."user_id",'MEMBER'
      FROM "campus_student_enrollments" s
      WHERE s."class_unit_id"=${input.classUnitId}
        AND s."status"='PENDING_CLASS_APPROVAL'
      RETURNING "id","user_id" AS "userId"
    `
    if(members.length!==v.registered) fail('APPROVAL_MEMBERSHIP_MISMATCH')
    const ids=members.map(m=>m.id)
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "organization_persona_grants" (
        "id","organization_id","membership_id","persona","granted_by_user_id"
      )
      SELECT gen_random_uuid()::text,${input.organizationId},m."id",'STUDENT',${input.actor.userId}
      FROM "organization_memberships" m WHERE m."id" IN (${Prisma.join(ids)})
    `)
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "organization_student_class_assignments" (
        "id","organization_id","membership_id","class_unit_id","is_primary"
      )
      SELECT gen_random_uuid()::text,${input.organizationId},m."id",${input.classUnitId},TRUE
      FROM "organization_memberships" m WHERE m."id" IN (${Prisma.join(ids)})
    `)
    await tx.$executeRaw`
      UPDATE "campus_student_enrollments" SET "status"='APPROVED',
        "approved_at"=statement_timestamp()
      WHERE "class_unit_id"=${input.classUnitId}
        AND "roster_version"=${row.rosterVersion}
        AND "status"='PENDING_CLASS_APPROVAL'
    `
    await tx.$executeRaw`
      UPDATE "campus_class_admissions" SET "status"='APPROVED',
        "approved_at"=statement_timestamp(), "approved_by_user_id"=${input.actor.userId},
        "updated_at"=statement_timestamp()
      WHERE "class_unit_id"=${input.classUnitId} AND "status"='CLOSED'
    `
    await appendAudit(tx,{
      organizationId:input.organizationId,actorUserId:input.actor.userId,
      action:'CAMPUS_CLASS_APPROVED',targetType:'CLASS',targetId:input.classUnitId,
      domainEventId:randomUUID(),payload:{ rosterVersion:row.rosterVersion,count:v.registered, approverMembershipId:context.membershipId },
    })
    return {status:'APPROVED' as const,approvedCount:v.registered,rosterVersion:row.rosterVersion}
  })
}

export async function readCampusStudentStatus(actor: AuthenticatedPrincipal) {
  if(actor.accountDomain!=='SCHOOL')fail('CAMPUS_ACCOUNT_REQUIRED',403)
  const rows=await prisma.$queryRaw<Array<{ organizationId:string; classUnitId:string; status:string }>>`
    SELECT "organization_id" AS "organizationId","class_unit_id" AS "classUnitId","status"
    FROM "campus_student_enrollments" WHERE "user_id"=${actor.userId}
    LIMIT 1
  `
  return rows[0]??{status:'NO_CAMPUS_CLASS',organizationId:null,classUnitId:null}
}

// Recording a suspected identity incident blocks class approval; no student
// number, username or answer material is accepted in the incident payload.
export async function createCampusAdmissionIncident(input: {
  actor: AuthenticatedPrincipal; organizationId: string; classUnitId: string;
  reason: 'SUSPECTED_REGISTRATION_TAKEOVER'|'ELIGIBILITY_DISPUTE'|'OTHER_REGISTRATION_ERROR'
}) {
  await assertCampusRecoveryAuthority(input.actor,input.organizationId)
  return prisma.$transaction(async tx=>{
    const admission=await admissionForUpdate(tx,input.organizationId,input.classUnitId)
    if(admission.status==='APPROVED')fail('INCIDENT_AFTER_APPROVAL_REQUIRES_QUARANTINE')
    const record=await tx.campusAdmissionIncident.create({data:{
      id:randomUUID(),organizationId:input.organizationId,classUnitId:input.classUnitId,reason:input.reason,
    }})
    await appendAudit(tx,{
      organizationId:input.organizationId,actorUserId:input.actor.userId,
      action:'CAMPUS_ADMISSION_INCIDENT_OPENED',targetType:'INCIDENT',targetId:record.id,
      domainEventId:randomUUID(),payload:{reason:input.reason},
    })
    return {incidentId:record.id,status:'OPEN' as const}
  })
}
export async function resolveCampusAdmissionIncident(input:{
  actor:AuthenticatedPrincipal;organizationId:string;classUnitId:string;incidentId:string;
  resolution:'VERIFIED_CORRECT'|'STUDENT_QUARANTINED'|'ROSTER_CORRECTED'
}) {
  await assertCampusRecoveryAuthority(input.actor,input.organizationId)
  return prisma.$transaction(async tx=>{
    await admissionForUpdate(tx,input.organizationId,input.classUnitId)
    const incident=await tx.campusAdmissionIncident.updateMany({
      where:{id:input.incidentId,organizationId:input.organizationId,classUnitId:input.classUnitId,resolvedAt:null},
      data:{resolvedAt:new Date()},
    })
    if(incident.count!==1)fail('INCIDENT_NOT_FOUND',404)
    await appendAudit(tx,{
      organizationId:input.organizationId,actorUserId:input.actor.userId,
      action:'CAMPUS_ADMISSION_INCIDENT_RESOLVED',targetType:'INCIDENT',targetId:input.incidentId,
      domainEventId:randomUUID(),payload:{resolution:input.resolution},
    })
    return {resolved:true}
  })
}

/** Quarantine never reassigns any existing FINAL or assessment respondent.
 * End an existing org membership, freeze credentials and revoke all sessions.
 * The incident stays open until separately reviewed, not automatically cleared.
 */
export async function quarantineCampusStudent(input:{
  actor:AuthenticatedPrincipal;organizationId:string;classUnitId:string;studentNumber:string
}) {
  await assertCampusRecoveryAuthority(input.actor,input.organizationId)
  const eligibilityDigest=digestCampusStudentNumber(input.organizationId,input.studentNumber)
  return prisma.$transaction(async tx=>{
    await admissionForUpdate(tx,input.organizationId,input.classUnitId)
    const elig=await tx.$queryRaw<Array<{id:string;userId:string|null}>>`
      SELECT "id","claimed_user_id" AS "userId" FROM "campus_student_eligibilities"
      WHERE "organization_id"=${input.organizationId} AND "class_unit_id"=${input.classUnitId}
        AND "student_no_digest"=${eligibilityDigest} FOR UPDATE
    `
    const userId=elig[0]?.userId
    if(!userId)fail('STUDENT_QUARANTINE_UNAVAILABLE',404)
    const account=await tx.user.findUnique({where:{id:userId}})
    if(!account||account.accountDomain!=='SCHOOL')fail('STUDENT_QUARANTINE_UNAVAILABLE',404)
    await tx.user.update({where:{id:userId},data:{isFrozen:true,tokenVersion:{increment:1}}})
    await tx.$executeRaw`
      UPDATE "campus_student_enrollments" SET "status"='QUARANTINED'
      WHERE "user_id"=${userId}
    `
    await tx.$executeRaw`
      UPDATE "organization_memberships" SET "valid_until"=statement_timestamp(),
          "ended_by_user_id"=${input.actor.userId},"end_reason"='CAMPUS_IDENTITY_QUARANTINE'
      WHERE "user_id"=${userId} AND "organization_id"=${input.organizationId}
        AND "valid_until" IS NULL
    `
    const incident=await tx.campusAdmissionIncident.create({data:{
      id:randomUUID(),organizationId:input.organizationId,
      classUnitId:input.classUnitId,reason:'SUSPECTED_REGISTRATION_TAKEOVER',
    }})
    await appendAudit(tx,{
      organizationId:input.organizationId,actorUserId:input.actor.userId,
      action:'CAMPUS_STUDENT_QUARANTINED',targetType:'INCIDENT',targetId:incident.id,
      domainEventId:randomUUID(),payload:{eligibilityId:elig[0].id},
    })
    return {status:'QUARANTINED' as const,incidentId:incident.id}
  })
}

