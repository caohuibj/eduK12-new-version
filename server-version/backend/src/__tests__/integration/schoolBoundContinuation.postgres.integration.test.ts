import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient, UserRole } from '@prisma/client'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { grantSyntheticHuischoolProduct } from './educationProductFixture'
import { createOrganizationUnit } from '../../modules/organization/structure'
import { assignStaffToClass } from '../../modules/organization/classRelationships'
import {
  replaceCampusRoster, setCampusRegistrationWindow, issueCampusActivationCodes,
  registerCampusStudent, approveCampusClass,
} from '../../modules/campus/admission.service'
import { createCampusActivity, changeCampusActivityStatus } from '../../modules/campus/activity.service'
import { allocateCampusActivityParticipants } from '../../modules/campus/activity.allocation'
import { createCampusActivityRunDraft } from '../../modules/campus/activity.runs'
import { listCampusStudentTasks, listCampusParentRunTasks } from '../../modules/campus/activity.tasks'
import { listCampusTeacherRunTasks } from '../../modules/campus/teacher-tasks'
import { addAssessmentRunTrackDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { closeAssessmentRun } from '../../modules/assessment-run/lifecycle'
import { listAssignedRunTasks } from '../../modules/assessment-run/productRead'
import { boundCompositeContinuationSql } from '../../modules/assessment-run/boundCompositeContinuation'
import { createSqlRelationalAssignmentRepository } from '../../modules/assessment-relational/repository'
import { relationalRuntimeConsentAuthority } from '../../modules/assessment-relational/runtime-consent'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { acceptRunExecutionConsent } from '../../modules/assessment-run/consent'
import { RunResourceAuthorityRegistry, type RunTrackNarrowingRequest } from '../../modules/assessment-run/resourceAuthority'
import type { AuthenticatedPrincipal } from '../../types'

const URL = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL')
const suite = URL ? describe : describe.skip
let db: PrismaClient
const previousHmac = process.env.CAMPUS_ELIGIBILITY_HMAC_KEY
const name = (prefix: string) => prefix + randomUUID().replace(/-/g, '').slice(0, 32 - prefix.length)
const actor = (u: { id: string; username: string; role: UserRole }): AuthenticatedPrincipal => ({
  userId: u.id, username: u.username, role: u.role, accountDomain: 'SCHOOL',
  platformRole: 'STANDARD', tokenVersion: 0, mustChangePassword: false,
})

async function fixture(withClosedClutter = false) {
  const admin = await db.user.create({ data: {
    username: name('continue_admin_'), accountDomain: 'SCHOOL', role: 'ADMIN', passwordHash: 'synthetic-only',
  } })
  const organization = await db.organization.create({ data: {
    id: randomUUID(), name: name('Continue school '), productDomain: 'SCHOOL', createdByUserId: admin.id,
  } })
  const organizationId = organization.id
  const adminMember = await db.organizationMembership.create({ data: {
    id: randomUUID(), organizationId, userId: admin.id, orgRole: 'ORG_ADMIN',
  } })
  await grantSyntheticHuischoolProduct(db, {
    organizationId, adminUserId: admin.id, adminMembershipId: adminMember.id,
  })
  const grade = await createOrganizationUnit({ organizationId, unitKind: 'GRADE', name: '年级' })
  const classroom = await createOrganizationUnit({ organizationId, unitKind: 'CLASS', name: '班级', parentUnitId: grade.id })
  const teacher = await db.user.create({ data: {
    username: name('continue_teacher_'), accountDomain: 'SCHOOL', role: 'TEACHER',
    teacherApproved: true, passwordHash: 'synthetic-only',
  } })
  const teacherMember = await db.organizationMembership.create({ data: {
    id: randomUUID(), organizationId, userId: teacher.id, orgRole: 'MEMBER',
  } })
  // The synthetic approver also has a teacher persona for the assigned observer task.
  for (const persona of ['COUNSELOR', 'TEACHER'] as const) {
    await db.organizationPersonaGrant.create({ data: {
      id: randomUUID(), organizationId, membershipId: teacherMember.id, persona, grantedByUserId: admin.id,
    } })
  }
  await db.organizationCapabilityGrant.create({ data: {
    id: randomUUID(), organizationId, membershipId: teacherMember.id,
    capability: 'PSYCHOLOGY_STAFF', grantedByUserId: admin.id,
  } })
  const staffAssignment = await assignStaffToClass({
    organizationId, membershipId: teacherMember.id, classUnitId: classroom.id, staffRole: 'HOMEROOM',
  })
  const studentNumber = name('N')
  const roster = await replaceCampusRoster({
    actor: actor(admin), organizationId, classUnitId: classroom.id, studentNumbers: [studentNumber],
  })
  await setCampusRegistrationWindow({
    actor: actor(admin), organizationId, classUnitId: classroom.id, action: 'OPEN',
    closesAt: new Date(Date.now() + 3_600_000),
  })
  const codes = await issueCampusActivationCodes({
    actor: actor(admin), organizationId, classUnitId: classroom.id, count: 1, ttlMinutes: 30,
  })
  const registered = await registerCampusStudent({
    organizationId, classUnitId: classroom.id, studentNumber, activationCode: codes.codes[0],
    username: name('continue_student_'), password: 'SyntheticPassword123',
  })
  await setCampusRegistrationWindow({ actor: actor(admin), organizationId, classUnitId: classroom.id, action: 'CLOSE' })
  await approveCampusClass({
    actor: actor(teacher), organizationId, classUnitId: classroom.id, expectedRosterVersion: roster.rosterVersion,
  })
  const student = await db.user.findUniqueOrThrow({ where: { id: registered.userId } })
  const studentMember = await db.organizationMembership.findFirstOrThrow({
    where: { organizationId, userId: student.id, validUntil: null },
  })
  const parent = await db.user.create({ data: {
    username: name('continue_parent_'), accountDomain: 'SCHOOL', role: 'PARENT', passwordHash: 'synthetic-only',
  } })
  const parentLink = await db.parentStudentRelationship.create({ data: {
    id: randomUUID(), parentUserId: parent.id, studentUserId: student.id,
    status: 'ACTIVE', approvedByUserId: student.id, approvedAt: new Date(),
  } })
  const activity = await createCampusActivity({
    actor: actor(admin), organizationId, title: 'Bound continuation', purpose: 'SCHOOL_CLIMATE',
  })
  await allocateCampusActivityParticipants({
    actor: actor(admin), organizationId, courseId: activity.id, classUnitIds: [classroom.id],
    requestKey: randomUUID(), expectedVersion: 1,
  })
  // One relationship pair per Run: repeated pair tracks hit a pre-existing
  // publisher uniqueness defect unrelated to continuation directory behavior.
  const runIds: string[] = []
  const composite = await db.compositeAssessment.create({ data: {
    code: name('continuation_'), name: 'Synthetic directory binding target', createdBy: admin.id,
  } })
  const policies: Record<string, RunTrackNarrowingRequest> = {}
  for (const key of ['self', 'parent', 'teacher', 'unstarted', 'wrongtarget', 'wrongassignment', 'revoked', 'expired']) {
    const policy: RunTrackNarrowingRequest = {
      subjectRoles: ['STUDENT'],
      respondentRoles: [key === 'parent' ? 'PARENT' : key === 'teacher' ? 'TEACHER' : 'STUDENT'],
      relationshipKinds: [key === 'parent' ? 'PARENT_CHILD' : key === 'teacher' ? 'CLASS_TEACHER_STUDENT' : 'SELF'],
      perspectives: [key === 'parent' || key === 'teacher' ? 'OBSERVER_REPORT' : 'SELF_REPORT'],
      analysisMode: 'INDIVIDUAL_ONLY', minimumRespondents: null,
      visibilityPolicyKey: key === 'parent' || key === 'teacher' ? 'observer_private_respondent_v1' : 'ORG_SELF_V1',
    }
    policies[key] = policy
    const run = await createCampusActivityRunDraft({
      actor: actor(admin), organizationId, courseId: activity.id, name: 'Bound continuation ' + key,
    })
    runIds.push(run.id)
    await addAssessmentRunTrackDraft({
      organizationId, runId: run.id, resource: { family: 'BUNDLE', key, version: 'synthetic-1' },
      subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [studentMember.id] },
      respondentSelector: key === 'parent' ? { kind: 'RELATED_PARENT' } : {
        kind: 'MEMBERSHIP_IDS', membershipIds: [key === 'teacher' ? teacherMember.id : studentMember.id],
      }, requestedPolicy: policy,
    })
  }
  const clutterRunIds: string[] = []
  if (withClosedClutter) {
    for (let index = 0; index < 101; index += 1) {
      const key = 'teacher-clutter-' + index
      policies[key] = policies.teacher
      const clutterRun = await createCampusActivityRunDraft({
        actor: actor(admin), organizationId, courseId: activity.id, name: 'Closed teacher candidate ' + index,
      })
      clutterRunIds.push(clutterRun.id)
      await addAssessmentRunTrackDraft({ organizationId, runId: clutterRun.id,
        resource: { family: 'BUNDLE', key, version: 'synthetic-1' },
        subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [studentMember.id] },
        respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [teacherMember.id] },
        requestedPolicy: policies.teacher,
      })
    }
  }
  const registry = new RunResourceAuthorityRegistry([{
    family: 'BUNDLE', capabilities: {
      transactionMode: 'TRANSACTIONAL_DB', startMode: 'TRANSACTIONAL', supportsLookupByOperationKey: false,
      supportsSafeCancel: true, finalAuthority: 'CANONICAL_RUNTIME', runtimeBindingKind: 'COMPOSITE', runV1Enabled: true,
    },
    async resolveExact(ref) {
      return { ...ref, ...policies[ref.key], scientificMaturity: 'PILOT',
        applicabilityHash: canonicalHash({ ref, policy: policies[ref.key] }),
        runtimeLaunchTarget: { kind: 'COMPOSITE', ref: composite.id } }
    },
  }])
  await changeCampusActivityStatus({ actor: actor(admin), organizationId, courseId: activity.id, action: 'SUBMIT', expectedVersion: 1 })
  await changeCampusActivityStatus({ actor: actor(admin), organizationId, courseId: activity.id, action: 'OPEN', expectedVersion: 2 })
  for (const runId of runIds) {
    const published = await publishAssessmentRun({ organizationId, runId, actorUserId: admin.id,
      expectedVersion: 2, resourceRegistry: registry })
    expect(published.executionCount).toBe(1)
  }
  const rows = await db.$queryRaw<Array<{ id: string; runId: string; key: string; assignmentId: string; respondentId: string }>>`
    SELECT e.id, e.run_id AS "runId", t.resource_key AS key, e.relational_assignment_id AS "assignmentId", actor.user_id AS "respondentId"
    FROM assessment_run_executions e JOIN assessment_run_tracks t ON t.id=e.track_id
    JOIN assessment_run_actor_snapshots actor ON actor.id=e.respondent_actor_snapshot_id
    WHERE e.run_id IN (${Prisma.join(runIds)})
  `
  const otherComposite = await db.compositeAssessment.create({ data: {
    code: name('other_target_'), name: 'Different target owned by same fixture', createdBy: admin.id,
  } })
  const attempts = new Map<string, string>()
  // Real persisted binding fixtures exercise the directory SQL, not the START engine.
  // Publication and close are actual domain operations; no runtime/FINAL success is claimed.
  for (const row of rows.filter(row => row.key !== 'unstarted')) {
    const assignment = await db.relationalAssessmentAssignment.findUniqueOrThrow({ where: { id: row.assignmentId } })
    if (assignment.consentId) await acceptRunExecutionConsent({ executionId: row.id, actorUserId: row.respondentId })
    const assignments = createSqlRelationalAssignmentRepository(db)
    const frozenAssignment = await assignments.findById(assignment.id)
    if (!frozenAssignment) throw new Error('Published assignment fixture missing')
    const acceptedConsent = assignment.consentId ? await assignments.resolveAcceptedConsent(frozenAssignment) : null
    const attempt = await db.compositeAssessmentAttempt.create({ data: {
      compositeAssessmentId: row.key === 'wrongtarget' ? otherComposite.id : composite.id,
      userId: row.respondentId, respondentUserId: row.respondentId,
      subjectUserId: student.id, episodeId: assignment.episodeId,
      assignmentRef: row.key === 'wrongassignment' ? rows.find(other => other.key === 'self')!.assignmentId : assignment.id,
      participantKey: 'synthetic:' + row.id, status: 'IN_PROGRESS', consentId: acceptedConsent?.consentId ?? null,
    } })
    await db.$executeRaw`UPDATE relational_assessment_assignments SET status='STARTED', started_at=now() WHERE id=${assignment.id}`
    await db.$executeRaw`UPDATE assessment_run_executions SET status='STARTED', started_at=now(),
      runtime_binding_kind='COMPOSITE', runtime_binding_ref=${attempt.id} WHERE id=${row.id}`
    if (row.key === 'revoked' || row.key === 'expired') {
      const terminalStatus = row.key.toUpperCase()
      await db.$executeRaw`UPDATE assessment_run_executions SET status=${terminalStatus} WHERE id=${row.id}`
    }
    attempts.set(row.key, attempt.id)
  }
  // The same 101 newer closed runs pressure Parent's run limit and
  // Teacher's execution limit; each is published through the real domain API.
  for (const runId of clutterRunIds) {
    const clutter = await publishAssessmentRun({ organizationId, runId,
      actorUserId: admin.id, expectedVersion: 2, resourceRegistry: registry })
    expect(clutter.executionCount).toBe(1)
    await closeAssessmentRun({ organizationId, runId, actorUserId: admin.id })
  }
  return { organizationId, activityId: activity.id, runIds, rows, attempts,
    admin: actor(admin), student: actor(student), teacher: actor(teacher), parent: actor(parent),
    studentMemberId: studentMember.id, staffAssignmentId: staffAssignment.id, parentLinkId: parentLink.id }
}

suite('School bound continuation directory (real PostgreSQL, synthetic persisted bindings)', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(URL!)
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY = '57'.repeat(32)
    db = new PrismaClient({ datasources: { db: { url: URL! } } })
    await db.$connect()
  })
  afterAll(async () => {
    await db?.$disconnect()
    if (previousHmac === undefined) delete process.env.CAMPUS_ELIGIBILITY_HMAC_KEY
    else process.env.CAMPUS_ELIGIBILITY_HMAC_KEY = previousHmac
  })

  it('preserves only exact bound School continuation after close, retaining default reader and live authority gates', async () => {
    const f = await fixture()
    const id = (key: string) => f.rows.find(row => row.key === key)!.id
    const students = () => listCampusStudentTasks(f.student, { page: 1, pageSize: 20 })
    const parents = () => listCampusParentRunTasks(f.parent)
    const teachers = () => listCampusTeacherRunTasks(f.teacher, f.organizationId)
    expect((await students()).list.find(task => task.id === id('unstarted'))?.status).toBe('PENDING')
    for (const runId of f.runIds) {
      await closeAssessmentRun({ organizationId: f.organizationId, runId, actorUserId: f.admin.userId })
    }
    expect((await students()).list).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: id('self'), status: 'IN_PROGRESS', canResumeExisting: true, href: expect.stringContaining(id('self')) }),
    ]))
    for (const key of ['unstarted', 'wrongtarget', 'wrongassignment', 'revoked', 'expired']) {
      expect((await students()).list.some(task => task.id === id(key))).toBe(false)
    }
    expect((await parents()).list).toEqual([expect.objectContaining({ executionId: id('parent'), status: 'STARTED', canResumeExisting: true })])
    expect((await teachers()).list).toEqual([expect.objectContaining({ executionId: id('teacher'), status: 'STARTED', canResumeExisting: true })])
    const defaultTasks = await listAssignedRunTasks(f.student.userId, { runIds: f.runIds })
    expect(defaultTasks.list.find(task => task.executionId === id('self'))?.status).toBe('EXPIRED')
    expect(defaultTasks).toEqual(await listAssignedRunTasks(f.student.userId, {
      runIds: f.runIds, preserveBoundSchoolContinuation: false,
    }))
    expect(defaultTasks.list.every(task => !Object.prototype.hasOwnProperty.call(task, 'canResumeExisting'))).toBe(true)
    const scoped = await listAssignedRunTasks(f.student.userId, {
      runIds: f.runIds, preserveBoundSchoolContinuation: true,
    })
    expect(defaultTasks.list.find(task => task.executionId === id('revoked'))?.status).toBe('REVOKED')
    expect(defaultTasks.list.find(task => task.executionId === id('expired'))?.status).toBe('EXPIRED')
    for (const key of ['wrongtarget', 'wrongassignment', 'revoked', 'expired']) {
      expect(scoped.list.some(task => task.executionId === id(key))).toBe(false)
    }
    // The reader uses the exact persisted binding, never just another attempt by this user.
    const predicate = boundCompositeContinuationSql(Prisma.sql`${id('self')}`, f.student.userId)
    expect((await db.$queryRaw<Array<{ allowed: boolean }>>`SELECT ${predicate} AS allowed`)[0].allowed).toBe(true)
    const originalCount = await db.compositeAssessmentAttempt.count({ where: { id: { in: [...f.attempts.values()] } } })
    expect(originalCount).toBe(7)
    await changeCampusActivityStatus({ actor: f.admin, organizationId: f.organizationId, courseId: f.activityId,
      action: 'PAUSE', expectedVersion: 3 })
    expect((await students()).list).toHaveLength(0)
    expect((await parents()).list).toHaveLength(0)
    expect((await teachers()).list).toHaveLength(0)
    await changeCampusActivityStatus({ actor: f.admin, organizationId: f.organizationId, courseId: f.activityId,
      action: 'RESUME', expectedVersion: 4 })
    expect((await students()).list.some(task => task.id === id('self'))).toBe(true)
    const deny = await db.organizationAccessDeny.create({ data: {
      id: randomUUID(), organizationId: f.organizationId, userId: f.student.userId,
      permission: 'RUN_START', reason: 'Synthetic live deny', deniedByUserId: f.admin.userId,
    } })
    expect((await students()).list).toHaveLength(0)
    expect((await parents()).list).toHaveLength(0)
    expect((await teachers()).list).toHaveLength(0)
    await db.organizationAccessDeny.update({ where: { id: deny.id }, data: {
      liftedAt: new Date(), liftedByUserId: f.admin.userId,
    } })
    expect((await students()).list.some(task => task.id === id('self'))).toBe(true)
    await db.parentStudentRelationship.update({ where: { id: f.parentLinkId }, data: { status: 'REVOKED', revokedAt: new Date() } })
    expect((await parents()).list).toHaveLength(0)
    await db.$executeRaw`UPDATE organization_staff_class_assignments SET valid_until=now() WHERE id=${f.staffAssignmentId}`
    expect((await teachers()).list).toHaveLength(0)
    await db.organizationMembership.update({ where: { id: f.studentMemberId }, data: { validUntil: new Date() } })
    expect((await students()).list).toHaveLength(0)
    await changeCampusActivityStatus({ actor: f.admin, organizationId: f.organizationId, courseId: f.activityId,
      action: 'CLOSE', expectedVersion: 5 })
    expect((await students()).list).toHaveLength(0)
    expect((await parents()).list).toHaveLength(0)
    expect((await teachers()).list).toHaveLength(0)
    expect(await db.compositeAssessmentAttempt.count({ where: { id: { in: [...f.attempts.values()] } } })).toBe(originalCount)
  })

  it('filters more than 100 ineligible CLOSED candidates before the Parent and Teacher pagination limits', async () => {
    const f = await fixture(true)
    const parentTask = f.rows.find(row => row.key === 'parent')!
    const teacherTask = f.rows.find(row => row.key === 'teacher')!
    // Both legitimate entries belong to the older, still PUBLISHED run.
    const parents = await listCampusParentRunTasks(f.parent)
    expect(parents.list).toEqual([expect.objectContaining({ executionId: parentTask.id, status: 'STARTED' })])
    expect(parents.truncated).toBe(false)
    const teachers = await listCampusTeacherRunTasks(f.teacher, f.organizationId)
    expect(teachers.list).toEqual([expect.objectContaining({ executionId: teacherTask.id, status: 'STARTED' })])
    expect(teachers.truncated).toBe(false)
  }, 60_000)


  it('removes revoked observer consent from CLOSED inboxes and retains the existing FINAL consent guard', async () => {
    const f = await fixture()
    for (const runId of f.runIds) {
      await closeAssessmentRun({ organizationId: f.organizationId, runId, actorUserId: f.admin.userId })
    }
    expect((await listCampusParentRunTasks(f.parent)).list).toHaveLength(1)
    expect((await listCampusTeacherRunTasks(f.teacher, f.organizationId)).list).toHaveLength(1)
    for (const role of ['parent', 'teacher'] as const) {
      const attemptId = f.attempts.get(role)!
      const respondent = f[role]
      // This is the existing FINAL-route authority, NOT a GET/runtime-read assertion.
      await expect(relationalRuntimeConsentAuthority.assertCompositeFinal(attemptId, respondent.userId)).resolves.toBeUndefined()
      const attempt = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: attemptId } })
      expect(attempt.consentId).not.toBeNull()
      const assignment = await db.relationalAssessmentAssignment.findUniqueOrThrow({ where: { id: attempt.assignmentRef! } })
      const revokedId = role === 'parent' ? attempt.consentId! : assignment.consentId!
      await db.assessmentAttemptConsent.update({ where: { id: revokedId }, data: { revokedAt: new Date() } })
      await expect(relationalRuntimeConsentAuthority.assertCompositeFinal(attemptId, respondent.userId))
        .rejects.toMatchObject({ code: 'RELATIONAL_CONSENT_REVOKED' })
      const tasks = role === 'parent' ? await listCampusParentRunTasks(f.parent)
        : await listCampusTeacherRunTasks(f.teacher, f.organizationId)
      expect(tasks.list).toHaveLength(0)
    }
  })

})
