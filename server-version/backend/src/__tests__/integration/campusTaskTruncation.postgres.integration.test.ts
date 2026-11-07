import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient, UserRole } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { grantSyntheticHuischoolProduct } from './educationProductFixture'
import { createOrganizationUnit } from '../../modules/organization/structure'
import { assignStaffToClass, assignStudentToClass } from '../../modules/organization/classRelationships'
import { createCampusActivity, changeCampusActivityStatus } from '../../modules/campus/activity.service'
import { addCampusActivityTask } from '../../modules/campus/activity.tasks'
import { allocateCampusActivityParticipants } from '../../modules/campus/activity.allocation'
import { createCampusActivityRunDraft } from '../../modules/campus/activity.runs'
import { listCampusStudentTasks, listCampusParentRunTasks } from '../../modules/campus/activity.tasks'
import { listCampusTeacherRunTasks } from '../../modules/campus/teacher-tasks'
import { addAssessmentRunTrackDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { decodeRunTaskCursor, encodeRunTaskCursor, type RunTaskCursor } from '../../modules/assessment-run/productRead'
import { RunResourceAuthorityRegistry, type RunTrackNarrowingRequest } from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import type { AuthenticatedPrincipal } from '../../types'

/**
 * Campus task-list truncation regression: before the keyset cursor, the
 * student Run portion, the teacher candidate query and the parent link query
 * all hard-stopped at 100 rows, so eligible tasks past the cut were
 * unreachable through any amount of page navigation. This suite publishes
 * more than 100 real runs/executions through the domain APIs and asserts
 * full reachability for all three respondent lists, plus cursor wire
 * round-trip and strict page disjointness.
 */
const URL = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL')
const suite = URL ? describe : describe.skip
let db: PrismaClient
const name = (prefix: string) => prefix + randomUUID().replace(/-/g, '').slice(0, 40 - prefix.length)
const actor = (u: { id: string; username: string; role: UserRole }): AuthenticatedPrincipal => ({
  userId: u.id, username: u.username, role: u.role, accountDomain: 'SCHOOL',
  platformRole: 'STANDARD', tokenVersion: 0, mustChangePassword: false,
})
const RUNS_PER_ROLE = 105

async function publishWithRetry(input: Parameters<typeof publishAssessmentRun>[0]): Promise<number> {
  // publishAssessmentRun runs at Serializable isolation; a concurrent publish
  // (e.g. another suite in the same worker) can force a transient retry.
  for (let attempt = 0; ; attempt++) {
    try { return (await publishAssessmentRun(input)).executionCount }
    catch (error) {
      const code = (error as { code?: string }).code
      if (attempt >= 3 || code !== 'P2034') throw error
    }
  }
}

let f: Awaited<ReturnType<typeof seed>> | null = null

beforeAll(async () => {
  requireIsolatedReleaseDatabase(URL!)
  const previousHmac = process.env.CAMPUS_ELIGIBILITY_HMAC_KEY
  process.env.CAMPUS_ELIGIBILITY_HMAC_KEY = 'ab'.repeat(32)
  ;(globalThis as { __campusTruncationPrevHmac?: string }).__campusTruncationPrevHmac = previousHmac
  db = new PrismaClient({ datasources: { db: { url: URL! } } })
  await db.$connect()
  f = await seed()
}, 600_000)
afterAll(async () => {
  try { if (db) await db.$disconnect() }
  finally {
    const previousHmac = (globalThis as { __campusTruncationPrevHmac?: string }).__campusTruncationPrevHmac
    if (previousHmac === undefined) delete process.env.CAMPUS_ELIGIBILITY_HMAC_KEY
    else process.env.CAMPUS_ELIGIBILITY_HMAC_KEY = previousHmac
  }
}, 120_000)

async function seed() {
  const admin = await db.user.create({ data: {
    username: name('trunc_admin_'), accountDomain: 'SCHOOL', role: 'ADMIN', passwordHash: 'synthetic-only',
  } })
  const organizationId = randomUUID()
  await db.organization.create({ data: { id: organizationId, name: name('Truncation school '), productDomain: 'SCHOOL', createdByUserId: admin.id } })
  const adminMember = await db.organizationMembership.create({ data: { id: randomUUID(), organizationId, userId: admin.id, orgRole: 'ORG_ADMIN' } })
  await grantSyntheticHuischoolProduct(db, { organizationId, adminUserId: admin.id, adminMembershipId: adminMember.id })
  const grade = await createOrganizationUnit({ organizationId, unitKind: 'GRADE', name: ' trunc grade' })
  const classroom = await createOrganizationUnit({ organizationId, unitKind: 'CLASS', name: ' trunc class', parentUnitId: grade.id })
  const teacher = await db.user.create({ data: {
    username: name('trunc_teacher_'), accountDomain: 'SCHOOL', role: 'TEACHER', teacherApproved: true, passwordHash: 'synthetic-only',
  } })
  const teacherMember = await db.organizationMembership.create({ data: { id: randomUUID(), organizationId, userId: teacher.id, orgRole: 'MEMBER' } })
  await db.organizationPersonaGrant.create({ data: { id: randomUUID(), organizationId, membershipId: teacherMember.id, persona: 'TEACHER', grantedByUserId: admin.id } })
  await assignStaffToClass({ organizationId, membershipId: teacherMember.id, classUnitId: classroom.id, staffRole: 'TEACHING' })

  const studentCount = 101
  const students = await Promise.all(Array.from({ length: studentCount }, (_, i) => db.user.create({ data: {
    username: name(`trunc_s${i}_`), accountDomain: 'SCHOOL', role: 'STUDENT', passwordHash: 'synthetic-only',
  } })))
  const memberships: string[] = []
  for (const student of students) {
    const member = await db.organizationMembership.create({ data: { id: randomUUID(), organizationId, userId: student.id, orgRole: 'MEMBER' } })
    memberships.push(member.id)
    await db.organizationPersonaGrant.create({ data: { id: randomUUID(), organizationId, membershipId: member.id, persona: 'STUDENT', grantedByUserId: admin.id } })
    await assignStudentToClass({ organizationId, membershipId: member.id, classUnitId: classroom.id })
  }
  // Same enrollment chain shape as the reviewed slot-competition fixture.
  await db.$executeRaw`INSERT INTO "campus_class_admissions" ("class_unit_id","organization_id","roster_version","roster_expected_count","status","approved_at","approved_by_user_id") VALUES (${classroom.id},${organizationId},1,${studentCount},'APPROVED',statement_timestamp(),${admin.id})`
  for (const student of students) {
    const eligibilityId = randomUUID()
    await db.$executeRaw`INSERT INTO "campus_student_eligibilities" ("id","organization_id","class_unit_id","student_no_digest","roster_version","claimed_user_id","status") VALUES (${eligibilityId},${organizationId},${classroom.id},${randomUUID()},1,${student.id},'VALID')`
    await db.$executeRaw`INSERT INTO "campus_student_enrollments" ("user_id","organization_id","class_unit_id","eligibility_id","roster_version","status","approved_at") VALUES (${student.id},${organizationId},${classroom.id},${eligibilityId},1,'APPROVED',statement_timestamp())`
  }

  const parent = await db.user.create({ data: {
    username: name('trunc_parent_'), accountDomain: 'SCHOOL', role: 'PARENT', passwordHash: 'synthetic-only',
  } })
  for (const student of students.slice(0,2)) {
    await db.parentStudentRelationship.create({ data: {
      id: randomUUID(), parentUserId: parent.id, studentUserId: student.id,
      status: 'ACTIVE', approvedByUserId: student.id, approvedAt: new Date(),
    } })
  }

  const owner = actor(admin)
  const activity = await createCampusActivity({ actor: owner, organizationId, title: name('Truncation activity'), purpose: 'STUDENT_WELLBEING' })
  const allocated = await allocateCampusActivityParticipants({
    actor: owner, organizationId, courseId: activity.id, classUnitIds: [classroom.id],
    membershipIds: memberships, requestKey: randomUUID(), expectedVersion: 1,
  })
  expect(allocated.selected).toBe(studentCount)

  const composite = await db.compositeAssessment.create({ data: {
    code: name('trunc_target_'), name: 'Synthetic truncation runtime target', createdBy: admin.id,
  } })
  const selfPolicy: RunTrackNarrowingRequest = {
    subjectRoles: ['STUDENT'], respondentRoles: ['STUDENT'], relationshipKinds: ['SELF'],
    perspectives: ['SELF_REPORT'], analysisMode: 'INDIVIDUAL_ONLY', minimumRespondents: null,
    visibilityPolicyKey: 'ORG_SELF_V1',
  }
  const parentPolicy: RunTrackNarrowingRequest = {
    subjectRoles: ['STUDENT'], respondentRoles: ['PARENT'], relationshipKinds: ['PARENT_CHILD'],
    perspectives: ['OBSERVER_REPORT'], analysisMode: 'INDIVIDUAL_ONLY', minimumRespondents: null,
    visibilityPolicyKey: 'observer_private_respondent_v1',
  }
  const teacherPolicy: RunTrackNarrowingRequest = {
    subjectRoles: ['STUDENT'], respondentRoles: ['TEACHER'], relationshipKinds: ['CLASS_TEACHER_STUDENT'],
    perspectives: ['OBSERVER_REPORT'], analysisMode: 'INDIVIDUAL_ONLY', minimumRespondents: null,
    visibilityPolicyKey: 'observer_assigning_teacher_v1',
  }
  const policies = new Map<string, RunTrackNarrowingRequest>()
  const registry = new RunResourceAuthorityRegistry([{
    family: 'BUNDLE', capabilities: {
      transactionMode: 'TRANSACTIONAL_DB', startMode: 'TRANSACTIONAL', supportsLookupByOperationKey: false,
      supportsSafeCancel: true, finalAuthority: 'CANONICAL_RUNTIME', runtimeBindingKind: 'COMPOSITE', runV1Enabled: true,
    },
    async resolveExact(ref) {
      const policy = policies.get(ref.key)
      if (!policy) throw new Error('unknown synthetic track ' + ref.key)
      return { ...ref, ...policy, scientificMaturity: 'PILOT',
        applicabilityHash: canonicalHash({ ref, policy }),
        runtimeLaunchTarget: { kind: 'COMPOSITE', ref: composite.id } }
    },
  }])

  const draft = async (key: string, policy: RunTrackNarrowingRequest,
    subject: { kind: 'MEMBERSHIP_IDS'; membershipIds: string[] },
    respondent: { kind: 'MEMBERSHIP_IDS'; membershipIds: string[] } | { kind: 'RELATED_PARENT' }) => {
    const run = await createCampusActivityRunDraft({ actor: owner, organizationId, courseId: activity.id, name: key })
    policies.set(key, policy)
    await addAssessmentRunTrackDraft({
      organizationId, runId: run.id, resource: { family: 'BUNDLE', key, version: 'synthetic-1' },
      subjectSelector: subject, respondentSelector: respondent, requestedPolicy: policy,
    })
    return run.id
  }
  const selfRunIds: string[] = []
  const parentRunIds: string[] = []
  for (let index = 0; index < RUNS_PER_ROLE; index++) {
    selfRunIds.push(await draft(`trunc-self-${index}`, selfPolicy,
      { kind: 'MEMBERSHIP_IDS', membershipIds: [memberships[0]!] }, { kind: 'MEMBERSHIP_IDS', membershipIds: [memberships[0]!] }))
    // Last parent Run has two subjects for the same parent. A Run-keyset
    // cursor could hide one of its executions at the 100-row cutoff.
    parentRunIds.push(await draft(`trunc-parent-${index}`, parentPolicy,
      { kind: 'MEMBERSHIP_IDS', membershipIds: index===RUNS_PER_ROLE-1
        ? [memberships[0]!,memberships[1]!] : [memberships[0]!] }, { kind: 'RELATED_PARENT' }))
  }
  const teacherRunId = await draft('trunc-teacher', teacherPolicy,
    { kind: 'MEMBERSHIP_IDS', membershipIds: memberships }, { kind: 'MEMBERSHIP_IDS', membershipIds: [teacherMember.id] })

  const assignment=await addCampusActivityTask({
    actor: owner, organizationId, courseId: activity.id, kind: 'ASSIGNMENT',
    title: 'Synthetic mixed-list assignment',
  })
  await changeCampusActivityStatus({ actor: owner, organizationId, courseId: activity.id, action: 'SUBMIT', expectedVersion: 1 })
  await changeCampusActivityStatus({ actor: owner, organizationId, courseId: activity.id, action: 'OPEN', expectedVersion: 2 })
  for (const runId of [...selfRunIds, ...parentRunIds, teacherRunId]) {
    await publishWithRetry({ organizationId, runId, actorUserId: admin.id, expectedVersion: 2, resourceRegistry: registry })
  }

  return { organizationId, activityId: activity.id, admin, teacher, parent, students, teacherRunId, selfRunIds, parentRunIds, assignmentId:assignment.id }
}

suite('campus task list truncation (real PostgreSQL)', () => {
  it('walks the teacher candidate keyset past the former 100-execution cut', async () => {
    const seen: string[] = []
    let cursor: RunTaskCursor | undefined
    let pages = 0
    for (;;) {
      const page = await listCampusTeacherRunTasks(actor(f!.teacher), f!.organizationId, cursor)
      expect(page.list.length).toBeLessThanOrEqual(100)
      seen.push(...page.list.map(t => t.executionId))
      pages++
      if (!page.nextCursor) break
      // truncated mirrors this page's own candidate cut, i.e. exactly the
      // nextCursor condition; the final page legitimately reports false.
      expect(page.truncated).toBe(true)
      // Wire round-trip: the route encodes; the next request decodes the same cursor.
      cursor = decodeRunTaskCursor(encodeRunTaskCursor(page.nextCursor))
      expect(pages).toBeLessThan(10)
    }
    expect(seen).toHaveLength(101)
    expect(new Set(seen).size).toBe(101)
  }, 60_000)

  it('walks the parent link keyset past the former 100-run cut with unique tasks', async () => {
    const seen: string[] = []
    let cursor: RunTaskCursor | undefined
    let pages = 0
    for (;;) {
      const page = await listCampusParentRunTasks(actor(f!.parent), cursor)
      expect(page.list.length).toBeLessThanOrEqual(100)
      seen.push(...page.list.map(t => t.executionId))
      pages++
      if (!page.nextCursor) break
      cursor = decodeRunTaskCursor(encodeRunTaskCursor(page.nextCursor))
      expect(pages).toBeLessThan(10)
    }
    // 105 parent Runs, but the newest Run has two eligible child executions.
    expect(seen).toHaveLength(RUNS_PER_ROLE+1)
    expect(new Set(seen).size).toBe(RUNS_PER_ROLE+1)
  }, 60_000)

  it('drains default 25-item pages before advancing Run cursor, without repeating mixed tasks', async () => {
    const seen: string[] = []
    const assignments: string[] = []
    let cursor: RunTaskCursor | undefined
    let batches = 0
    for (;;) {
      let pageNumber = 1
      let next: RunTaskCursor | null = null
      for (;;) {
        const page = await listCampusStudentTasks(actor(f!.students[0]!), {
          page: pageNumber, pageSize: 25, runCursor: cursor,
        })
        expect(page.list.length).toBeLessThanOrEqual(25)
        seen.push(...page.list.filter(t => t.kind === 'MEASUREMENT').map(t => t.id))
        assignments.push(...page.list.filter(t => t.kind === 'ASSIGNMENT').map(t => t.id))
        if (page.hasMore) {
          expect(page.nextRunCursor).toBeNull()
          pageNumber++
          expect(pageNumber).toBeLessThan(12)
        } else {
          next = page.nextRunCursor
          break
        }
      }
      batches++
      if (!next) break
      cursor = decodeRunTaskCursor(encodeRunTaskCursor(next))
      expect(batches).toBeLessThan(10)
    }
    expect(batches).toBeGreaterThan(1)
    expect(seen).toHaveLength(RUNS_PER_ROLE)
    expect(new Set(seen).size).toBe(RUNS_PER_ROLE)
    expect(assignments).toEqual([f!.assignmentId])
  }, 60_000)

  it('rejects malformed cursors on all three campus list entry points', async () => {
    const bad = Buffer.from('{"createdAt":"2026-02-31T00:00:00.000000Z","id":"x"}').toString('base64url')
    expect(() => decodeRunTaskCursor(bad)).toThrow()
    await expect(listCampusTeacherRunTasks(f!.teacher, f!.organizationId, { createdAt: '2026-13-01T00:00:00.000000Z', id: 'x' }))
      .rejects.toThrow()
  }, 30_000)
})
