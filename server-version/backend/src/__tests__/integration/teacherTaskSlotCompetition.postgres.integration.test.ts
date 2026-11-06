import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PlatformRole, PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { createMembership, denyOrganizationAccess, grantPersona } from '../../modules/organization/service'
import { createOrganizationUnit } from '../../modules/organization/structure'
import { assignStaffToClass, assignStudentToClass } from '../../modules/organization/classRelationships'
import { addAssessmentRunTrackDraft } from '../../modules/assessment-run/repository'
import { previewAssessmentRun, publishAssessmentRun } from '../../modules/assessment-run/publish'
import { decodeRunTaskCursor, encodeRunTaskCursor, listAssignedRunTasks } from '../../modules/assessment-run/productRead'
import { RunResourceAuthorityRegistry, type RunResourceAuthorityAdapter } from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createCampusActivity, changeCampusActivityStatus } from '../../modules/campus/activity.service'
import { allocateCampusActivityParticipants } from '../../modules/campus/activity.allocation'
import { createCampusActivityRunDraft } from '../../modules/campus/activity.runs'
import { listCampusTeacherRunTasks } from '../../modules/campus/teacher-tasks'
import { listMyAssessments } from '../../modules/assessment-policy/inbox.routes'
import { assessmentRunController } from '../../modules/assessment-run/run.controller'
import type { AuthenticatedPrincipal } from '../../types'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const key = (label: string) => `teacher-slot-${label}-${suffix}-${randomUUID()}`

const observerPolicy = {
  subjectRoles: ['STUDENT'],
  respondentRoles: ['TEACHER'],
  relationshipKinds: ['CLASS_TEACHER_STUDENT'],
  perspectives: ['OBSERVER_REPORT'],
  analysisMode: 'INDIVIDUAL_ONLY',
  visibilityPolicyKey: 'observer_assigning_teacher_v1',
  minimumRespondents: null,
}

const adapter: RunResourceAuthorityAdapter = {
  family: 'BUNDLE',
  capabilities: {
    transactionMode: 'TRANSACTIONAL_DB',
    startMode: 'TRANSACTIONAL',
    supportsLookupByOperationKey: false,
    supportsSafeCancel: true,
    finalAuthority: 'CANONICAL_RUNTIME',
    runtimeBindingKind: 'COMPOSITE',
    runV1Enabled: true,
  },
  async resolveExact(ref) {
    return {
      family: ref.family,
      key: ref.key,
      version: ref.version,
      scientificMaturity: 'PILOT',
      applicabilityHash: canonicalHash({ ref, applicability: observerPolicy }),
      ...observerPolicy,
      runtimeLaunchTarget: { kind: 'COMPOSITE', ref: 'teacher-slot-composite' },
    }
  },
}
const registry = new RunResourceAuthorityRegistry([adapter])

type SeedUser = { id: string; username: string; role: UserRole; tokenVersion: number }
async function createUser(label: string, role: UserRole): Promise<SeedUser> {
  return db.user.create({
    data: {
      username: `teacher-slot-${label}-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role,
      accountDomain: 'SCHOOL',
    },
    select: { id: true, username: true, role: true, tokenVersion: true },
  })
}

const principal = (user: SeedUser): AuthenticatedPrincipal => ({
  userId: user.id,
  username: user.username,
  role: user.role,
  platformRole: PlatformRole.STANDARD,
  tokenVersion: user.tokenVersion,
  mustChangePassword: false,
  accountDomain: 'SCHOOL',
})

async function mapChunked<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)))
  }
  return out
}

// Minimal Express res stub for the handler-level round-trip tests: the
// handlers only use setHeader, status().json() and json(). There is no
// supertest harness in this repo, so the handlers are invoked directly with
// req.user preset, bypassing only the authenticate middleware.
function stubRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader() {},
    status(code: number) { res.statusCode = code; return res },
    json(body: unknown) { res.body = body; return res },
  }
  return res
}
const throwingNext = (err: unknown): never => { throw err }

suite('Teacher task slot competition (real PostgreSQL)', () => {
  let prevCampusEligibilityHmacKey: string | undefined
  let hadCampusEligibilityHmacKey = false
  let sharedSeed: Awaited<ReturnType<typeof seedTeacherSlotRun>> | null = null

  beforeAll(async () => {
    requireIsolatedReleaseDatabase(DB_URL!)
    // listCampusTeacherRunTasks derives student references from this HMAC
    // key; other campus integration tests set the same test-only value.
    // Save and restore it: a leaked test-only value must not change the
    // environment for suites sharing the worker (P2-03).
    hadCampusEligibilityHmacKey = Object.prototype.hasOwnProperty.call(process.env, 'CAMPUS_ELIGIBILITY_HMAC_KEY')
    prevCampusEligibilityHmacKey = process.env.CAMPUS_ELIGIBILITY_HMAC_KEY
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY = 'ab'.repeat(32)
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
    // One shared unstaggered seed for the new tests: publish inserts all 101
    // executions in one transaction, so they share a single microsecond
    // timestamp — the production shape the keyset cursor must handle.
    sharedSeed = await seedTeacherSlotRun(false, false)
  }, 240_000)
  afterAll(async () => {
    try { if (db) await db.$disconnect() }
    finally {
      if (hadCampusEligibilityHmacKey) process.env.CAMPUS_ELIGIBILITY_HMAC_KEY = prevCampusEligibilityHmacKey!
      else delete process.env.CAMPUS_ELIGIBILITY_HMAC_KEY
    }
  }, 120_000)

  // One OPEN campus activity, one PUBLISHED run, 101 executions: the same
  // teacher observes 101 students of one class. The 101st execution is the
  // newest; the other 100 are staggered older by seed order.
  // staggerCreatedAt=false keeps the publish-time timestamps untouched: all
  // 101 rows share the single transaction-start timestamp, the production
  // shape for the keyset cursor.
  async function seedTeacherSlotRun(denyLast: boolean, staggerCreatedAt = true) {
    const seed = `${suffix}-${randomUUID().slice(0, 8)}`
    const owner = await createUser('owner', UserRole.TEACHER)
    const teacher = await createUser('teacher', UserRole.TEACHER)
    // createOrganization always creates a LEGACY org and the product-domain
    // guard forbids a SCHOOL user in it, while the immutability trigger
    // forbids flipping it afterwards. Other integration tests create SCHOOL
    // orgs directly (INSERT with productDomain), so do the same here.
    const organizationId = randomUUID()
    await db.organization.create({
      data: { id: organizationId, name: `Teacher slot ${seed}`, productDomain: 'SCHOOL', createdByUserId: owner.id },
    })
    const ownerMembershipId = randomUUID()
    await db.organizationMembership.create({
      data: { id: ownerMembershipId, organizationId, userId: owner.id, orgRole: 'ORG_ADMIN' },
    })
    // A SCHOOL org downgrades ORG_ADMIN to MEMBER unless the membership
    // holds a HUISCHOOL PRODUCT_ADMIN grant (access.ts schoolOrgRole).
    // The grant references the entitlement row, so insert that first.
    await db.$executeRaw`INSERT INTO "education_product_entitlements" ("organization_id","product","status","granted_by_user_id") VALUES (${organizationId},'HUISCHOOL','ACTIVE',${owner.id})`
    await db.$executeRaw`INSERT INTO "education_product_role_grants" ("id","organization_id","membership_id","product","role","granted_by_user_id") VALUES (${randomUUID()},${organizationId},${ownerMembershipId},'HUISCHOOL','PRODUCT_ADMIN',${owner.id})`

    const teacherMember = await createMembership({ organizationId, userId: teacher.id, meta: { actorUserId: owner.id, commandKey: key('teacher-member') } })
    await grantPersona({ organizationId, membershipId: teacherMember.id, persona: 'TEACHER', meta: { actorUserId: owner.id, commandKey: key('teacher-persona') } })

    const students = await mapChunked(Array.from({ length: 101 }, (_, i) => i), 10, (i) => createUser(`student-${i}`, UserRole.STUDENT))
    const memberships = await mapChunked(students, 10, (student) => createMembership({
      organizationId, userId: student.id, meta: { actorUserId: owner.id, commandKey: key(`member-${student.id}`) },
    }))
    await mapChunked(memberships, 10, (member) => grantPersona({
      organizationId, membershipId: member.id, persona: 'STUDENT', meta: { actorUserId: owner.id, commandKey: key(`persona-${member.id}`) },
    }))
    const grade = await createOrganizationUnit({ organizationId, unitKind: 'GRADE', name: `Slot grade ${seed}` })
    const classroom = await createOrganizationUnit({ organizationId, unitKind: 'CLASS', name: `Slot class ${seed}`, parentUnitId: grade.id })
    await assignStaffToClass({ organizationId, membershipId: teacherMember.id, classUnitId: classroom.id, staffRole: 'TEACHING' })
    await mapChunked(memberships, 10, (member) => assignStudentToClass({ organizationId, membershipId: member.id, classUnitId: classroom.id }))

    await db.$executeRaw`INSERT INTO "campus_class_admissions" ("class_unit_id","organization_id","roster_version","roster_expected_count","status","approved_at","approved_by_user_id") VALUES (${classroom.id},${organizationId},1,101,'APPROVED',statement_timestamp(),${owner.id})`
    await mapChunked(students, 10, async (student) => {
      const eligibilityId = randomUUID()
      await db.$executeRaw`INSERT INTO "campus_student_eligibilities" ("id","organization_id","class_unit_id","student_no_digest","roster_version","claimed_user_id","status") VALUES (${eligibilityId},${organizationId},${classroom.id},${randomUUID()},1,${student.id},'VALID')`
      await db.$executeRaw`INSERT INTO "campus_student_enrollments" ("user_id","organization_id","class_unit_id","eligibility_id","roster_version","status","approved_at") VALUES (${student.id},${organizationId},${classroom.id},${eligibilityId},1,'APPROVED',statement_timestamp())`
    })

    const ownerPrincipal = principal(owner)
    const activity = await createCampusActivity({
      actor: ownerPrincipal, organizationId, title: `Slot activity ${seed}`, purpose: 'STUDENT_WELLBEING',
    })
    const participants = students.slice(0, 100)
    const extra = students[100]
    const allocated = await allocateCampusActivityParticipants({
      actor: ownerPrincipal, organizationId, courseId: activity.id,
      classUnitIds: [classroom.id],
      membershipIds: memberships.map((member) => member.id),
      requestKey: `slot-alloc-${seed}`, expectedVersion: 1,
    })
    expect(allocated.selected).toBe(101)

    const run = await createCampusActivityRunDraft({
      actor: ownerPrincipal, organizationId, courseId: activity.id, name: `Slot run ${seed}`,
    })
    await addAssessmentRunTrackDraft({
      organizationId, runId: run.id,
      resource: { family: 'BUNDLE', key: `teacher-slot-${seed}`, version: '1.0.0' },
      subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: memberships.map((member) => member.id) },
      respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [teacherMember.id] },
      requestedPolicy: observerPolicy,
    })
    // Publish requires the activity OPEN; preview does not.
    await changeCampusActivityStatus({ actor: ownerPrincipal, organizationId, courseId: activity.id, action: 'SUBMIT', expectedVersion: 1 })
    await changeCampusActivityStatus({ actor: ownerPrincipal, organizationId, courseId: activity.id, action: 'OPEN', expectedVersion: 2 })
    const preview = await previewAssessmentRun({
      organizationId, runId: run.id, actorUserId: owner.id, expectedVersion: 2, resourceRegistry: registry,
    })
    expect(preview.tracks[0]).toMatchObject({ executionCount: 101 })
    await publishAssessmentRun({
      organizationId, runId: run.id, actorUserId: owner.id, expectedVersion: 2, resourceRegistry: registry,
    })

    if (denyLast) {
      // Publish scopes a campus run to its selected participants, and the
      // generic reader rechecks the same campus authority, so a revoked
      // participant or enrollment cannot steal a reader slot — both sides
      // exclude it. The real divergence is the access-deny vocabulary: the
      // teacher candidate query refuses executions whose teacher OR student
      // carries an ACTIVITY_READ deny, while listAssignedRunTasks only checks
      // RUN_START denies. An ACTIVITY_READ deny is a genuine production state
      // (denyOrganizationAccess), so the denied student's execution stays in
      // the run and in the reader's newest 100, but is no longer an eligible
      // teacher task — while still consuming a reader slot.
      await denyOrganizationAccess({
        organizationId, userId: extra.id, permission: 'ACTIVITY_READ',
        reason: 'slot-competition counterexample',
        meta: { actorUserId: owner.id, commandKey: key('deny') },
      })
    }

    // Deterministic ordering: the 101st execution is newest, the other 100
    // are older, staggered by seed order. Skipped when staggerCreatedAt is
    // false: the publish-time timestamps are then all identical, which is
    // the production case the same-timestamp test pins.
    const executions = await db.$queryRaw<Array<{ id: string; subjectUserId: string }>>`
      SELECT e."id", s."user_id" AS "subjectUserId"
      FROM "assessment_run_executions" e
      JOIN "assessment_run_actor_snapshots" s ON s."id" = e."subject_actor_snapshot_id"
      WHERE e."run_id" = ${run.id}
    `
    expect(executions).toHaveLength(101)
    const bySubject = new Map(executions.map((row) => [row.subjectUserId, row.id]))
    if (staggerCreatedAt) {
      const now = Date.now()
      for (let i = 0; i < participants.length; i++) {
        await db.$executeRaw`UPDATE "assessment_run_executions" SET "created_at" = ${new Date(now - (101 - i) * 60_000)} WHERE "id" = ${bySubject.get(participants[i].id)!}`
      }
      await db.$executeRaw`UPDATE "assessment_run_executions" SET "created_at" = ${new Date(now)} WHERE "id" = ${bySubject.get(extra.id)!}`
    }
    return {
      organizationId, teacher, runId: run.id, bySubject, participants, extra,
      oldestEligibleId: bySubject.get(participants[0].id)!,
    }
  }

  it('does not drop an eligible task when a newer denied-student execution shares the run', async () => {
    const { organizationId, teacher, bySubject, extra, oldestEligibleId } = await seedTeacherSlotRun(true)
    const result = await listCampusTeacherRunTasks(principal(teacher), organizationId)
    expect(result.list).toHaveLength(100)
    expect(result.list.map((row) => row.executionId)).toContain(oldestEligibleId)
    expect(result.list.map((row) => row.executionId)).not.toContain(bySubject.get(extra.id))
    expect(result.truncated).toBe(false)
  }, 180_000)

  it('pages run tasks by (created_at, id) keyset without loss or duplication', async () => {
    const { teacher, bySubject, participants, extra } = await seedTeacherSlotRun(false)
    // Default page: 100 of 101, truncated, with a cursor to the last row.
    const first = await listAssignedRunTasks(teacher.id, {})
    expect(first.list).toHaveLength(100)
    expect(first.truncated).toBe(true)
    expect(first.nextCursor).not.toBeNull()
    const second = await listAssignedRunTasks(teacher.id, { cursor: first.nextCursor! })
    expect(second.list).toHaveLength(1)
    expect(second.truncated).toBe(false)
    expect(second.nextCursor).toBeNull()
    expect([...first.list, ...second.list].map((row) => row.executionId).sort())
      .toEqual([...bySubject.values()].sort())

    // Cursor helpers round-trip; malformed cursors are rejected, not silently
    // treated as the first page.
    expect(decodeRunTaskCursor(encodeRunTaskCursor(first.nextCursor!))).toEqual(first.nextCursor)
    expect(() => decodeRunTaskCursor('!!!not-a-cursor')).toThrow('RUN_TASK_CURSOR_INVALID')
    expect(decodeRunTaskCursor(undefined)).toBeUndefined()

    // Small pages walk the whole set in (created_at DESC, id DESC) order:
    // the newest execution first, then the staggered participants in reverse
    // seed order, with no row seen twice.
    const seen: string[] = []
    let cursor: { createdAt: string; id: string } | undefined
    let pages = 0
    while (true) {
      const page = await listAssignedRunTasks(teacher.id, { limit: 3, cursor })
      expect(page.list.length).toBeLessThanOrEqual(3)
      seen.push(...page.list.map((row) => row.executionId))
      pages++
      if (!page.nextCursor) break
      cursor = page.nextCursor
      expect(pages).toBeLessThan(100)
    }
    expect(pages).toBe(34)
    expect(new Set(seen).size).toBe(101)
    expect(seen).toEqual([bySubject.get(extra.id)!, ...participants.slice().reverse().map((s) => bySubject.get(s.id)!)])
  }, 180_000)

  it('pages all 101 tasks when every execution shares one microsecond timestamp', async () => {
    // P1 counterexample (review of PR #648): a Run publish inserts all its
    // executions in one transaction, so CURRENT_TIMESTAMP — the transaction
    // start — is identical for all of them. A cursor built from a JavaScript
    // Date (millisecond precision) truncates 12:00:00.123456 to 12:00:00.123,
    // and the next page's (created_at, id) comparison then drops every
    // remaining row sharing that timestamp. The cursor must carry full
    // TIMESTAMPTZ(6) precision, sourced from PostgreSQL itself.
    const { teacher, runId } = sharedSeed!
    const distinct = await db.$queryRaw<Array<{ count: string }>>`
      SELECT COUNT(DISTINCT "created_at") AS "count" FROM "assessment_run_executions" WHERE "run_id" = ${runId}`
    expect(Number(distinct[0].count)).toBe(1)
    const expected = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "assessment_run_executions" WHERE "run_id" = ${runId}
      ORDER BY "created_at" DESC, "id" DESC`
    const seen: string[] = []
    let cursor: { createdAt: string; id: string } | undefined
    let pages = 0
    while (true) {
      const page = await listAssignedRunTasks(teacher.id, { limit: 3, cursor })
      expect(page.list.length).toBeLessThanOrEqual(3)
      if (page.nextCursor) expect(page.nextCursor.createdAt).toMatch(/\.\d{6}Z$/)
      seen.push(...page.list.map((row) => row.executionId))
      pages++
      if (!page.nextCursor) break
      cursor = page.nextCursor
      expect(pages).toBeLessThan(100)
    }
    expect(pages).toBe(34)
    expect(new Set(seen).size).toBe(101)
    expect(seen).toEqual(expected.map((row) => row.id))
  }, 180_000)

  it('inbox HTTP round-trip: the returned nextRunCursor string fetches the next page', async () => {
    // P1-02: the inbox endpoint must return the cursor as the same opaque
    // base64url string its query accepts; returning the internal
    // {createdAt, id} object cannot be sent back verbatim.
    const { teacher } = sharedSeed!
    const req1: any = { user: { userId: teacher.id, role: 'TEACHER' }, query: { runLimit: '3' } }
    const res1 = stubRes()
    await listMyAssessments(req1, res1, throwingNext)
    expect(res1.statusCode).toBe(200)
    const first = res1.body.data
    expect(typeof first.nextRunCursor).toBe('string')
    const firstRunIds = first.list.filter((t: any) => t.sourceType === 'ORGANIZATION_RUN').map((t: any) => t.taskId)
    expect(firstRunIds).toHaveLength(3)
    const req2: any = { user: { userId: teacher.id, role: 'TEACHER' }, query: { runCursor: first.nextRunCursor, runLimit: '3' } }
    const res2 = stubRes()
    await listMyAssessments(req2, res2, throwingNext)
    expect(res2.statusCode).toBe(200)
    const second = res2.body.data
    expect(typeof second.nextRunCursor).toBe('string')
    const secondRunIds = second.list.filter((t: any) => t.sourceType === 'ORGANIZATION_RUN').map((t: any) => t.taskId)
    expect(secondRunIds).toHaveLength(3)
    expect(secondRunIds.some((id: string) => firstRunIds.includes(id))).toBe(false)
  }, 180_000)

  it('assigned-tasks HTTP round-trip: the returned nextCursor string fetches the next page', async () => {
    // P1-02, second endpoint: same round-trip property for
    // GET /organizations/assigned-tasks.
    const { teacher } = sharedSeed!
    const req1: any = { user: { userId: teacher.id, role: 'TEACHER' }, query: { limit: '3' } }
    const res1 = stubRes()
    await assessmentRunController.assignedTasks(req1, res1)
    expect(res1.statusCode).toBe(200)
    const first = res1.body.data
    expect(typeof first.nextCursor).toBe('string')
    expect(first.list).toHaveLength(3)
    const req2: any = { user: { userId: teacher.id, role: 'TEACHER' }, query: { cursor: first.nextCursor, limit: '3' } }
    const res2 = stubRes()
    await assessmentRunController.assignedTasks(req2, res2)
    expect(res2.statusCode).toBe(200)
    const second = res2.body.data
    expect(second.list).toHaveLength(3)
    const firstIds = first.list.map((t: any) => t.executionId)
    const secondIds = second.list.map((t: any) => t.executionId)
    expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false)
  }, 180_000)
})
