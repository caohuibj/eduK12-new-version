import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma as db } from '../../config/database'
import { currentRunActorAuthoritySql, currentWindowSql, type RunAuthorityPurpose } from '../../modules/assessment-run/currentActorAuthority'
import { currentRunPopulationAuthoritySql, type RunPopulationProductScope } from '../../modules/assessment-run/currentPopulationAuthority'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { grantSyntheticHuischoolProduct } from './educationProductFixture'

const DB_URL = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL')
const suite = DB_URL ? describe : describe.skip
if (DB_URL) requireIsolatedReleaseDatabase(DB_URL)

const evaluateNew = async (
  executionId: string,
  purpose: RunAuthorityPurpose,
  scope: RunPopulationProductScope,
): Promise<boolean> => {
  const rows = await db.$queryRaw<Array<{ ok: boolean }>>`
    SELECT ${currentRunPopulationAuthoritySql(Prisma.sql`${executionId}`, purpose, scope)} AS "ok"
  `
  return Boolean(rows[0]?.ok)
}

/** Pre-refactor baseline predicates scanning actor snapshots via NOT EXISTS for differential PG equivalence. */
const baselineActorCheckSql = (
  purpose: RunAuthorityPurpose,
): Prisma.Sql => Prisma.sql`
  NOT EXISTS (
    SELECT 1 FROM assessment_run_actor_snapshots actor
    WHERE actor.id IN (x.subject_actor_snapshot_id,x.respondent_actor_snapshot_id)
      AND NOT (${currentRunActorAuthoritySql({
        userId: Prisma.sql`actor.user_id`,
        organizationId: Prisma.sql`org.id`,
        provenance: Prisma.sql`actor.provenance_kind`,
        membershipId: Prisma.sql`actor.membership_id`,
        personaGrantId: Prisma.sql`actor.snapshot_payload->>'personaGrantId'`,
        role: Prisma.sql`actor.actor_role`,
      }, purpose)})
  )
`

const baselineCampusStudentCheckSql = (
  purpose: RunAuthorityPurpose,
): Prisma.Sql => Prisma.sql`
  EXISTS(
    SELECT 1 FROM assessment_run_actor_snapshots student_actor
    WHERE student_actor.id IN (x.subject_actor_snapshot_id,x.respondent_actor_snapshot_id)
      AND student_actor.actor_role='STUDENT'
  )
  AND NOT EXISTS(
    SELECT 1 FROM assessment_run_actor_snapshots student_actor
    WHERE student_actor.id IN (x.subject_actor_snapshot_id,x.respondent_actor_snapshot_id)
      AND student_actor.actor_role='STUDENT'
      AND NOT EXISTS(
        SELECT 1 FROM campus_activity_runs ar
        JOIN campus_activities activity ON activity.course_id=ar.course_id
          AND activity.organization_id=ar.organization_id
          AND ${purpose === 'REPORT_READ' ? Prisma.sql`(activity.status IN ('OPEN','PAUSED','CLOSED') AND x.status='COMPLETED')` : Prisma.sql`activity.status='OPEN'`}
        JOIN campus_activity_participants member ON member.course_id=ar.course_id
          AND member.organization_id=ar.organization_id AND member.status='ACTIVE'
          AND member.membership_id=student_actor.membership_id
        JOIN organization_memberships membership ON membership.id=member.membership_id
          AND membership.organization_id=member.organization_id
          AND membership.user_id=student_actor.user_id
          AND ${currentWindowSql(Prisma.sql`membership`)}
        JOIN campus_student_enrollments enrollment ON enrollment.user_id=student_actor.user_id
          AND enrollment.organization_id=member.organization_id AND enrollment.status='APPROVED'
        JOIN campus_class_admissions admission ON admission.organization_id=enrollment.organization_id
          AND admission.class_unit_id=enrollment.class_unit_id AND admission.status='APPROVED'
        JOIN organization_student_class_assignments class_assignment
          ON class_assignment.organization_id=member.organization_id
          AND class_assignment.membership_id=member.membership_id
          AND class_assignment.class_unit_id=enrollment.class_unit_id
          AND ${currentWindowSql(Prisma.sql`class_assignment`)}
        JOIN users campus_student ON campus_student.id=student_actor.user_id
          AND campus_student.account_domain='SCHOOL'
          AND campus_student.is_active=TRUE AND campus_student.is_frozen=FALSE
        WHERE ar.organization_id=org.id AND ar.run_id=x.run_id
      )
  )
  AND NOT EXISTS(
    SELECT 1 FROM assessment_run_actor_snapshots foreign_actor
    JOIN users actor_user ON actor_user.id=foreign_actor.user_id
    WHERE foreign_actor.id IN (x.subject_actor_snapshot_id,x.respondent_actor_snapshot_id)
      AND actor_user.account_domain<>'SCHOOL'
  )
`

const actorClause = (alias: 'subject' | 'respondent', purpose: RunAuthorityPurpose): Prisma.Sql =>
  currentRunActorAuthoritySql({
    userId: Prisma.raw(`${alias}.user_id`),
    organizationId: Prisma.sql`org.id`,
    provenance: Prisma.raw(`${alias}.provenance_kind`),
    membershipId: Prisma.raw(`${alias}.membership_id`),
    personaGrantId: Prisma.raw(`${alias}.snapshot_payload->>'personaGrantId'`),
    role: Prisma.raw(`${alias}.actor_role`),
  }, purpose)

const campusStudentClause = (alias: 'subject' | 'respondent', purpose: RunAuthorityPurpose): Prisma.Sql => {
  const membershipId = Prisma.raw(`${alias}.membership_id`)
  const userId = Prisma.raw(`${alias}.user_id`)
  const actorRole = Prisma.raw(`${alias}.actor_role`)
  return Prisma.sql`(${actorRole}<>'STUDENT' OR EXISTS(
    SELECT 1 FROM campus_activity_runs ar
    JOIN campus_activities activity ON activity.course_id=ar.course_id
      AND activity.organization_id=ar.organization_id
      AND ${purpose === 'REPORT_READ' ? Prisma.sql`(activity.status IN ('OPEN','PAUSED','CLOSED') AND x.status='COMPLETED')` : Prisma.sql`activity.status='OPEN'`}
    JOIN campus_activity_participants member ON member.course_id=ar.course_id
      AND member.organization_id=ar.organization_id AND member.status='ACTIVE'
      AND member.membership_id=${membershipId}
    JOIN organization_memberships membership ON membership.id=member.membership_id
      AND membership.organization_id=member.organization_id
      AND membership.user_id=${userId}
      AND ${currentWindowSql(Prisma.sql`membership`)}
    JOIN campus_student_enrollments enrollment ON enrollment.user_id=${userId}
      AND enrollment.organization_id=member.organization_id AND enrollment.status='APPROVED'
    JOIN campus_class_admissions admission ON admission.organization_id=enrollment.organization_id
      AND admission.class_unit_id=enrollment.class_unit_id AND admission.status='APPROVED'
    JOIN organization_student_class_assignments class_assignment
      ON class_assignment.organization_id=member.organization_id
      AND class_assignment.membership_id=member.membership_id
      AND class_assignment.class_unit_id=enrollment.class_unit_id
      AND ${currentWindowSql(Prisma.sql`class_assignment`)}
    JOIN users campus_student ON campus_student.id=${userId}
      AND campus_student.account_domain='SCHOOL'
      AND campus_student.is_active=TRUE AND campus_student.is_frozen=FALSE
    WHERE ar.organization_id=org.id AND ar.run_id=x.run_id
  ))`
}

const evaluateClausePair = async (
  executionId: string,
  purpose: RunAuthorityPurpose,
): Promise<{
  oldActor: boolean
  newActor: boolean
  oldCampus: boolean
  newCampus: boolean
}> => {
  const rows = await db.$queryRaw<Array<{
    oldActor: boolean
    newActor: boolean
    oldCampus: boolean
    newCampus: boolean
  }>>`
    SELECT
      (${baselineActorCheckSql(purpose)}) AS "oldActor",
      (${actorClause('subject', purpose)} AND (x.respondent_actor_snapshot_id=x.subject_actor_snapshot_id OR ${actorClause('respondent', purpose)})) AS "newActor",
      (${baselineCampusStudentCheckSql(purpose)}) AS "oldCampus",
      ((subject.actor_role='STUDENT' OR respondent.actor_role='STUDENT')
        AND ${campusStudentClause('subject', purpose)}
        AND (x.respondent_actor_snapshot_id=x.subject_actor_snapshot_id OR ${campusStudentClause('respondent', purpose)})
        AND EXISTS(SELECT 1 FROM users actor_user WHERE actor_user.id=subject.user_id AND actor_user.account_domain='SCHOOL')
        AND (x.respondent_actor_snapshot_id=x.subject_actor_snapshot_id OR respondent.user_id=subject.user_id
          OR EXISTS(SELECT 1 FROM users actor_user WHERE actor_user.id=respondent.user_id AND actor_user.account_domain='SCHOOL'))
      ) AS "newCampus"
    FROM assessment_run_executions x
    JOIN organizations org ON org.id = x.organization_id
    JOIN assessment_run_actor_snapshots subject ON subject.id = x.subject_actor_snapshot_id
    JOIN assessment_run_actor_snapshots respondent ON respondent.id = x.respondent_actor_snapshot_id
    WHERE x.id = ${executionId}
  `
  return rows[0]
}

const assertEquivalent = async (
  executionId: string,
  expected?: Partial<Record<`${RunAuthorityPurpose}:${RunPopulationProductScope}`, boolean>>,
): Promise<void> => {
  const purposes: RunAuthorityPurpose[] = ['COLLECTION', 'REPORT_READ']
  const scopes: RunPopulationProductScope[] = ['ALL', 'CAMPUS_ONLY', 'HUITEACHER_ONLY']
  for (const purpose of purposes) {
    const pair = await evaluateClausePair(executionId, purpose)
    expect(pair.newActor, `${executionId} ${purpose} actor clause`).toBe(pair.oldActor)
    expect(pair.newCampus, `${executionId} ${purpose} campus student clause`).toBe(pair.oldCampus)
    for (const scope of scopes) {
      const actual = await evaluateNew(executionId, purpose, scope)
      const key = `${purpose}:${scope}` as const
      if (expected && key in expected) {
        expect(actual, `${executionId} ${key}`).toBe(expected[key])
      }
    }
  }
}

suite('currentRunPopulationAuthoritySql real PostgreSQL actor-reuse equivalence', () => {
  const suffix = `pop_eq_${Date.now()}_${randomUUID().slice(0, 6)}`
  const hash64 = (ch: string) => ch.repeat(64)

  const createSchoolUser = (role: 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT', accountDomain: 'SCHOOL' | 'TRAINING' = 'SCHOOL') =>
    db.user.create({
      data: {
        id: randomUUID(),
        username: `${suffix}_${role.toLowerCase()}_${randomUUID().slice(0, 6)}`,
        passwordHash: 'synthetic',
        role,
        accountDomain,
        teacherApproved: role === 'TEACHER',
      },
    })

  beforeAll(() => {
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY = '73'.repeat(32)
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('matches across SELF, EXTERNAL_PARENT (different subject), CLASS_TEACHER_STUDENT, revocations and REPORT_READ', async () => {
    const admin = await createSchoolUser('ADMIN')
    const student = await createSchoolUser('STUDENT')
    const parent = await createSchoolUser('PARENT')
    const teacher = await createSchoolUser('TEACHER')

    const org = await db.organization.create({
      data: {
        id: randomUUID(),
        name: `${suffix}_org`,
        productDomain: 'SCHOOL',
        status: 'ACTIVE',
        createdByUserId: admin.id,
      },
    })

    const adminMembership = await db.organizationMembership.create({
      data: { id: randomUUID(), organizationId: org.id, userId: admin.id, orgRole: 'ORG_ADMIN' },
    })
    await grantSyntheticHuischoolProduct(db, {
      organizationId: org.id,
      adminUserId: admin.id,
      adminMembershipId: adminMembership.id,
    })
    await db.educationProductEntitlement.create({
      data: { organizationId: org.id, product: 'HUITEACHER', status: 'ACTIVE', grantedByUserId: admin.id },
    })

    const studentMem = await db.organizationMembership.create({
      data: { id: randomUUID(), organizationId: org.id, userId: student.id, orgRole: 'MEMBER' },
    })
    const teacherMem = await db.organizationMembership.create({
      data: { id: randomUUID(), organizationId: org.id, userId: teacher.id, orgRole: 'MEMBER' },
    })
    const studentGrant = await db.organizationPersonaGrant.create({
      data: { id: randomUUID(), organizationId: org.id, membershipId: studentMem.id, persona: 'STUDENT', grantedByUserId: admin.id },
    })
    const teacherGrant = await db.organizationPersonaGrant.create({
      data: { id: randomUUID(), organizationId: org.id, membershipId: teacherMem.id, persona: 'TEACHER', grantedByUserId: admin.id },
    })

    const gradeId = randomUUID()
    const classId = randomUUID()
    await db.$executeRaw`INSERT INTO "organization_units"("id","organization_id","unit_kind","name") VALUES(${gradeId},${org.id},'GRADE','G1')`
    await db.$executeRaw`INSERT INTO "organization_units"("id","organization_id","unit_kind","name","parent_unit_id") VALUES(${classId},${org.id},'CLASS','C1',${gradeId})`

    const studentClassId = randomUUID()
    const staffClassId = randomUUID()
    const eligibilityId = randomUUID()
    await db.$executeRaw`
      INSERT INTO "organization_student_class_assignments"("id","organization_id","membership_id","class_unit_id")
      VALUES(${studentClassId},${org.id},${studentMem.id},${classId})
    `
    await db.$executeRaw`
      INSERT INTO "organization_staff_class_assignments"("id","organization_id","membership_id","class_unit_id","staff_role")
      VALUES(${staffClassId},${org.id},${teacherMem.id},${classId},'TEACHING')
    `
    await db.$executeRaw`
      INSERT INTO "campus_class_admissions"("class_unit_id","organization_id","roster_version","roster_expected_count","status","approved_at")
      VALUES(${classId},${org.id},1,1,'APPROVED',now())
    `
    await db.$executeRaw`
      INSERT INTO "campus_student_eligibilities"("id","organization_id","class_unit_id","student_no_digest","roster_version","claimed_user_id","status")
      VALUES(${eligibilityId},${org.id},${classId},${hash64('e')},1,${student.id},'VALID')
    `
    await db.$executeRaw`
      INSERT INTO "campus_student_enrollments"("user_id","organization_id","class_unit_id","eligibility_id","roster_version","status","approved_at")
      VALUES(${student.id},${org.id},${classId},${eligibilityId},1,'APPROVED',now())
    `
    const parentLinkId = randomUUID()
    await db.$executeRaw`
      INSERT INTO "parent_student_relationships"("id","parent_user_id","student_user_id","status","approved_at","updated_at")
      VALUES(${parentLinkId},${parent.id},${student.id},'ACTIVE',now(),now())
    `

    // Campus course + OPEN activity + run + participant
    const courseId = randomUUID()
    await db.$executeRaw`
      INSERT INTO "courses"("id","title","course_code","creator_id","course_type","is_library","is_recruiting","status","organization_id","updated_at")
      VALUES(${courseId},${suffix + '_course'},${suffix + '_code'},${teacher.id},'CAMPUS_ACTIVITY',FALSE,FALSE,'PUBLISHED',${org.id},now())
    `
    await db.$executeRaw`
      INSERT INTO "campus_activities"("course_id","organization_id","owner_membership_id","purpose","status","opened_by_user_id","opened_at")
      VALUES(${courseId},${org.id},${teacherMem.id},'SCHOOL_CLIMATE','OPEN',${admin.id},now())
    `
    await db.$executeRaw`
      INSERT INTO "campus_activity_participants"("course_id","organization_id","membership_id","status","selected_by_user_id")
      VALUES(${courseId},${org.id},${studentMem.id},'ACTIVE',${admin.id})
    `

    const campusRunId = randomUUID()
    const campusTrackId = randomUUID()
    await db.$executeRaw`
      INSERT INTO "assessment_runs"("id","organization_id","name","status","created_by_user_id","published_at")
      VALUES(${campusRunId},${org.id},${suffix + '_campus_run'},'PUBLISHED',${admin.id},now())
    `
    await db.$executeRaw`
      INSERT INTO "campus_activity_runs"("course_id","organization_id","run_id","bound_by_user_id")
      VALUES(${courseId},${org.id},${campusRunId},${admin.id})
    `
    await db.$executeRaw`
      INSERT INTO "assessment_run_tracks"("id","organization_id","run_id","resource_family","resource_key","resource_version","requested_policy","frozen_resource_policy","resource_policy_hash")
      VALUES(${campusTrackId},${org.id},${campusRunId},'FORM','campus-form:test','1.0.0','{}'::jsonb,'{}'::jsonb,${hash64('a')})
    `

    const stuActorId = randomUUID()
    const parActorId = randomUUID()
    const tchActorId = randomUUID()
    await db.$executeRaw`
      INSERT INTO "assessment_run_actor_snapshots"("id","organization_id","run_id","user_id","actor_role","provenance_kind","membership_id","external_relationship_ref","snapshot_payload","snapshot_hash")
      VALUES
        (${stuActorId},${org.id},${campusRunId},${student.id},'STUDENT','ORG_MEMBER',${studentMem.id},NULL,${JSON.stringify({ personaGrantId: studentGrant.id })}::jsonb,${hash64('1')}),
        (${parActorId},${org.id},${campusRunId},${parent.id},'PARENT','EXTERNAL_PARENT',NULL,${parentLinkId},'{}'::jsonb,${hash64('2')}),
        (${tchActorId},${org.id},${campusRunId},${teacher.id},'TEACHER','ORG_MEMBER',${teacherMem.id},NULL,${JSON.stringify({ personaGrantId: teacherGrant.id })}::jsonb,${hash64('3')})
    `

    const relSelfId = randomUUID()
    const relParentId = randomUUID()
    const relTeacherId = randomUUID()
    await db.$executeRaw`
      INSERT INTO "assessment_run_relationship_snapshots"("id","organization_id","run_id","relationship_kind","relationship_ref","subject_actor_snapshot_id","respondent_actor_snapshot_id","snapshot_payload","snapshot_hash")
      VALUES
        (${relSelfId},${org.id},${campusRunId},'SELF',NULL,${stuActorId},${stuActorId},'{}'::jsonb,${hash64('4')}),
        (${relParentId},${org.id},${campusRunId},'PARENT_CHILD',${parentLinkId},${stuActorId},${parActorId},${JSON.stringify({ facts: { studentClassAssignmentId: studentClassId } })}::jsonb,${hash64('5')}),
        (${relTeacherId},${org.id},${campusRunId},'CLASS_TEACHER_STUDENT',NULL,${stuActorId},${tchActorId},${JSON.stringify({ facts: { studentClassAssignmentId: studentClassId, staffClassAssignmentId: staffClassId } })}::jsonb,${hash64('6')})
    `

    const execSelfId = randomUUID()
    const execParentId = randomUUID()
    const execTeacherCampusId = randomUUID()
    await db.$executeRaw`
      INSERT INTO "assessment_run_executions"("id","organization_id","run_id","track_id","subject_actor_snapshot_id","respondent_actor_snapshot_id","relationship_snapshot_id","status","runtime_binding_kind","runtime_binding_ref","started_at","completed_at")
      VALUES
        (${execSelfId},${org.id},${campusRunId},${campusTrackId},${stuActorId},${stuActorId},${relSelfId},'ASSIGNED',NULL,NULL,NULL,NULL),
        (${execParentId},${org.id},${campusRunId},${campusTrackId},${stuActorId},${parActorId},${relParentId},'COMPLETED','COMPOSITE_SUBMISSION',${randomUUID()},now(),now()),
        (${execTeacherCampusId},${org.id},${campusRunId},${campusTrackId},${stuActorId},${tchActorId},${relTeacherId},'ASSIGNED',NULL,NULL,NULL,NULL)
    `

    // 1. SELF ASSIGNED, PARENT_CHILD COMPLETED, CLASS_TEACHER_STUDENT ASSIGNED under OPEN activity
    await assertEquivalent(execSelfId, { 'COLLECTION:CAMPUS_ONLY': true, 'REPORT_READ:CAMPUS_ONLY': false, 'COLLECTION:HUITEACHER_ONLY': false })
    await assertEquivalent(execParentId, { 'COLLECTION:CAMPUS_ONLY': true, 'REPORT_READ:CAMPUS_ONLY': true })
    await assertEquivalent(execTeacherCampusId, { 'COLLECTION:CAMPUS_ONLY': true, 'REPORT_READ:CAMPUS_ONLY': false })

    // 2. SELF becomes COMPLETED + activity PAUSED -> REPORT_READ allowed, COLLECTION blocked
    await db.$executeRaw`
      UPDATE "assessment_run_executions"
      SET "status" = 'COMPLETED', "runtime_binding_kind" = 'COMPOSITE_SUBMISSION', "runtime_binding_ref" = ${randomUUID()}, "started_at" = now(), "completed_at" = now()
      WHERE "id" = ${execSelfId}
    `
    await db.$executeRaw`UPDATE "campus_activities" SET "status" = 'PAUSED' WHERE "course_id" = ${courseId}`
    await assertEquivalent(execSelfId, { 'COLLECTION:CAMPUS_ONLY': false, 'REPORT_READ:CAMPUS_ONLY': true })
    await db.$executeRaw`UPDATE "campus_activities" SET "status" = 'OPEN' WHERE "course_id" = ${courseId}`

    // 3. Revoke parent link -> external parent denied while student SELF remains valid
    await db.$executeRaw`UPDATE "parent_student_relationships" SET "status" = 'REVOKED' WHERE "id" = ${parentLinkId}`
    await assertEquivalent(execParentId, { 'COLLECTION:CAMPUS_ONLY': false, 'REPORT_READ:CAMPUS_ONLY': false })
    await assertEquivalent(execSelfId, { 'COLLECTION:CAMPUS_ONLY': true, 'REPORT_READ:CAMPUS_ONLY': true })
    await db.$executeRaw`UPDATE "parent_student_relationships" SET "status" = 'ACTIVE' WHERE "id" = ${parentLinkId}`

    // 4. Expire student class assignment -> all student-dependent roles denied
    await db.$executeRaw`UPDATE "organization_student_class_assignments" SET "valid_from" = now() - interval '2 minutes', "valid_until" = now() - interval '1 minute' WHERE "id" = ${studentClassId}`
    await assertEquivalent(execSelfId, { 'COLLECTION:CAMPUS_ONLY': false, 'REPORT_READ:CAMPUS_ONLY': false })
    await assertEquivalent(execParentId, { 'COLLECTION:CAMPUS_ONLY': false, 'REPORT_READ:CAMPUS_ONLY': false })
    await db.$executeRaw`UPDATE "organization_student_class_assignments" SET "valid_until" = NULL WHERE "id" = ${studentClassId}`

    // 5. Teacher event (SELF + teacher->student evaluation) + access denies & persona revocation
    const targetId = randomUUID()
    const eventId = randomUUID()
    const teacherRunId = randomUUID()
    const teacherTrackId = randomUUID()
    const formResourceId = randomUUID()
    const teacherFormKey = `huiteacher-student-form:${formResourceId}`
    await db.$executeRaw`
      INSERT INTO "huiteacher_evaluation_targets"("id","organization_id","kind","name","subject_user_id","created_by_user_id")
      VALUES(${targetId},${org.id},'PERSON',${teacher.username},${teacher.id},${admin.id})
    `
    await db.$executeRaw`
      INSERT INTO "huiteacher_evaluation_events"("id","organization_id","kind","target_id","title","status","created_by_user_id")
      VALUES(${eventId},${org.id},'ASSESSMENT',${targetId},${suffix + '_evt'},'DRAFT',${admin.id})
    `
    await db.$executeRaw`
      INSERT INTO "assessment_runs"("id","organization_id","name","status","created_by_user_id","published_at")
      VALUES(${teacherRunId},${org.id},${suffix + '_teacher_run'},'PUBLISHED',${admin.id},now())
    `
    await db.$executeRaw`
      INSERT INTO "huiteacher_evaluation_run_links"("organization_id","event_id","run_id","bound_by_user_id")
      VALUES(${org.id},${eventId},${teacherRunId},${admin.id})
    `
    await db.$executeRaw`
      INSERT INTO "huiteacher_form_instruments"("id","organization_id","title","status","revision","definition","definition_digest","created_by_user_id","published_at")
      VALUES(${formResourceId},${org.id},'tform','PUBLISHED',1,'{}'::jsonb,${hash64('f')},${admin.id},now())
    `
    await db.$executeRaw`
      INSERT INTO "huiteacher_student_eval_configs"("id","organization_id","event_id","class_unit_id","staff_assignment_id","form_id","definition_digest","configured_by_user_id")
      VALUES(${randomUUID()},${org.id},${eventId},${classId},${staffClassId},${formResourceId},${hash64('f')},${admin.id})
    `
    await db.$executeRaw`
      UPDATE "huiteacher_evaluation_events" SET "status" = 'OPEN', "opened_at" = now() WHERE "id" = ${eventId}
    `
    await db.$executeRaw`
      INSERT INTO "assessment_run_tracks"("id","organization_id","run_id","resource_family","resource_key","resource_version","requested_policy","frozen_resource_policy","resource_policy_hash")
      VALUES(${teacherTrackId},${org.id},${teacherRunId},'FORM',${teacherFormKey},${hash64('f')},'{}'::jsonb,'{}'::jsonb,${hash64('b')})
    `
    const tSelfActor = randomUUID()
    const tStuActor = randomUUID()
    await db.$executeRaw`
      INSERT INTO "assessment_run_actor_snapshots"("id","organization_id","run_id","user_id","actor_role","provenance_kind","membership_id","snapshot_payload","snapshot_hash")
      VALUES
        (${tSelfActor},${org.id},${teacherRunId},${teacher.id},'TEACHER','ORG_MEMBER',${teacherMem.id},${JSON.stringify({ personaGrantId: teacherGrant.id })}::jsonb,${hash64('7')}),
        (${tStuActor},${org.id},${teacherRunId},${student.id},'STUDENT','ORG_MEMBER',${studentMem.id},${JSON.stringify({ personaGrantId: studentGrant.id })}::jsonb,${hash64('8')})
    `
    const tRelSelf = randomUUID()
    const tRelStuEval = randomUUID()
    await db.$executeRaw`
      INSERT INTO "assessment_run_relationship_snapshots"("id","organization_id","run_id","relationship_kind","subject_actor_snapshot_id","respondent_actor_snapshot_id","snapshot_payload","snapshot_hash")
      VALUES
        (${tRelSelf},${org.id},${teacherRunId},'SELF',${tSelfActor},${tSelfActor},'{}'::jsonb,${hash64('9')}),
        (${tRelStuEval},${org.id},${teacherRunId},'CLASS_TEACHER_STUDENT',${tSelfActor},${tStuActor},${JSON.stringify({ facts: { classUnitId: classId, studentClassAssignmentId: studentClassId, staffClassAssignmentId: staffClassId } })}::jsonb,${hash64('0')})
    `
    const execTeacherSelfId = randomUUID()
    const execStuEvalTeacherId = randomUUID()
    await db.$executeRaw`
      INSERT INTO "assessment_run_executions"("id","organization_id","run_id","track_id","subject_actor_snapshot_id","respondent_actor_snapshot_id","relationship_snapshot_id","status","runtime_binding_kind","runtime_binding_ref","started_at","completed_at")
      VALUES
        (${execTeacherSelfId},${org.id},${teacherRunId},${teacherTrackId},${tSelfActor},${tSelfActor},${tRelSelf},'COMPLETED','HUITEACHER_FORM_SUBMISSION',${randomUUID()},now(),now()),
        (${execStuEvalTeacherId},${org.id},${teacherRunId},${teacherTrackId},${tSelfActor},${tStuActor},${tRelStuEval},'ASSIGNED',NULL,NULL,NULL,NULL)
    `

    await assertEquivalent(execTeacherSelfId, { 'COLLECTION:HUITEACHER_ONLY': true, 'REPORT_READ:HUITEACHER_ONLY': true, 'COLLECTION:CAMPUS_ONLY': false })
    await assertEquivalent(execStuEvalTeacherId, { 'COLLECTION:HUITEACHER_ONLY': true, 'COLLECTION:CAMPUS_ONLY': false })

    // Revoke RUN_START -> blocks COLLECTION while COMPLETED REPORT_READ survives; CLOSED event blocks ASSIGNED; revoke TEACHER persona -> denies both
    const denyId = randomUUID()
    await db.$executeRaw`
      INSERT INTO "organization_access_denies"("id","organization_id","user_id","permission","reason","denied_by_user_id")
      VALUES(${denyId},${org.id},${teacher.id},'RUN_START','revoked start',${admin.id})
    `
    await assertEquivalent(execTeacherSelfId, { 'COLLECTION:HUITEACHER_ONLY': false, 'REPORT_READ:HUITEACHER_ONLY': true })
    await db.$executeRaw`UPDATE "organization_access_denies" SET "lifted_at" = now() WHERE "id" = ${denyId}`

    await db.$executeRaw`UPDATE "huiteacher_evaluation_events" SET "status" = 'CLOSED', "closed_at" = now() WHERE "id" = ${eventId}`
    await assertEquivalent(execTeacherSelfId, { 'REPORT_READ:HUITEACHER_ONLY': true })
    await assertEquivalent(execStuEvalTeacherId, { 'COLLECTION:HUITEACHER_ONLY': false, 'REPORT_READ:HUITEACHER_ONLY': false })

    await db.$executeRaw`UPDATE "organization_persona_grants" SET "revoked_at" = now() WHERE "id" = ${teacherGrant.id}`
    await assertEquivalent(execTeacherSelfId, { 'COLLECTION:HUITEACHER_ONLY': false, 'REPORT_READ:HUITEACHER_ONLY': false })
    await assertEquivalent(execStuEvalTeacherId, { 'COLLECTION:HUITEACHER_ONLY': false, 'REPORT_READ:HUITEACHER_ONLY': false })
  }, 30000)
})
