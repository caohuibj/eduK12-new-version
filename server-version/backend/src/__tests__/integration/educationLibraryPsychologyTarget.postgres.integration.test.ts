import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { completeEducationLibraryScaleExecution } from './educationLibraryReportFixture'
import { acceptRunExecutionConsent } from '../../modules/assessment-run/consent'
import { readEducationRespondentScaleReport } from '../../modules/reporting/education-scale-personal-report.service'
import { setupEducationLibraryRuntimeFixture } from './educationLibraryRuntimeFixture'
import { assignStaffToClass } from '../../modules/organization/classRelationships'
import { createCampusActivityRunDraft } from '../../modules/campus/activity.runs'
import { addAssessmentRunTrackDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'), suite = url ? describe : describe.skip
let db: PrismaClient
suite('School psychologist real ALL_CURRENT teacher-target selection', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    process.env.DATA_ENCRYPTION_KEY ||= '55'.repeat(32)
    process.env.DATA_PSEUDONYM_KEY ||= '56'.repeat(32)
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY ||= '57'.repeat(32)
    db = new PrismaClient({ datasources: { db: { url: url! } } }); await db.$connect()
  })
  afterAll(async () => { await db?.$disconnect() })
  it('rejects a mixed teacher target atomically and publishes only the explicitly selected HOMEROOM population', async () => {
    const f = await setupEducationLibraryRuntimeFixture({ db, product: 'SCHOOL', responseMode: 'TEACHER_REPORT',
      publisher: 'PSYCHOLOGY', publish: false, trackCount: 0 })
    const teaching = await db.user.create({ data: { username: 'edteach' + randomUUID().replaceAll('-', '').slice(0, 20),
      passwordHash: 'synthetic-only', accountDomain: 'SCHOOL', role: 'TEACHER', teacherApproved: true } })
    const member = await db.organizationMembership.create({ data: { id: randomUUID(), organizationId: f.organizationId, userId: teaching.id } })
    await db.organizationPersonaGrant.create({ data: { id: randomUUID(), organizationId: f.organizationId, membershipId: member.id,
      persona: 'TEACHER', grantedByUserId: f.schoolAdmin!.userId } })
    await assignStaffToClass({ organizationId: f.organizationId, membershipId: member.id, classUnitId: f.classUnitId!, staffRole: 'TEACHING' })
    const add = (runId: string, mode: 'ALL_CLASS_TEACHERS' | 'HOMEROOM_TEACHER') => addAssessmentRunTrackDraft({
      organizationId: f.organizationId, runId, actorUserId: f.managerUserId, resource: f.resource,
      subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [f.subjectMembershipId] }, respondentSelector: { kind: 'ALL_CURRENT' },
      requestedPolicy: { ...f.requestedPolicy, targetPolicy: { mode } } })
    // A second draft uses the same real activity, source and mixed class. No SQL
    // repair of policy or population hides the failed broad-target publication.
    const next = await createCampusActivityRunDraft({ actor: f.manager, organizationId: f.organizationId,
      courseId: f.workflow.id, name: '明确仅班主任评价' })
    await add(next.id, 'HOMEROOM_TEACHER')
    await add(f.runId, 'ALL_CLASS_TEACHERS'); await f.open()
    await expect(f.publish()).rejects.toMatchObject({ code: 'RUN_PUBLISH_SCOPE' })
    const [failed] = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM assessment_run_executions WHERE run_id=${f.runId}`
    expect(Number(failed.count)).toBe(0)
    const [version] = await db.$queryRaw<Array<{ version: number }>>`SELECT version FROM assessment_runs WHERE id=${next.id}`
    const published = await publishAssessmentRun({ organizationId: f.organizationId, runId: next.id,
      actorUserId: f.managerUserId, expectedVersion: version.version })
    expect(published.executionCount).toBe(1)
    const rows = await db.$queryRaw<Array<{ executionId: string; respondentUserId: string; policy: any }>>`SELECT e.id AS "executionId", a.user_id AS "respondentUserId", t.frozen_resource_policy AS policy
      FROM assessment_run_executions e JOIN assessment_run_actor_snapshots a ON a.id=e.respondent_actor_snapshot_id
      JOIN assessment_run_tracks t ON t.id=e.track_id WHERE e.run_id=${next.id}`
    expect(rows).toHaveLength(1)
    expect(rows[0].respondentUserId).toBe(f.participantUserId)
    expect(rows.some(row => row.respondentUserId === teaching.id)).toBe(false)
    expect(Object.values(rows[0].policy.resultDisclosure.audiences).every((rule: any) => rule.mode === 'NONE')).toBe(true)
    expect(await acceptRunExecutionConsent({ executionId: rows[0].executionId, actorUserId: f.participantUserId })).toMatchObject({ accepted: true })
    const completed = await completeEducationLibraryScaleExecution({ db, actorUserId: f.participantUserId,
      executionId: rows[0].executionId, answers: f.answers })
    expect(completed.finalUnit.sourceAttemptId).toBe(completed.child.id)
    expect(completed.parent.subjectUserId).toBe(f.subjectUserId)
    expect(completed.parent.respondentUserId).toBe(f.participantUserId)
    for (const actorUserId of [f.managerUserId, f.participantUserId, f.subjectUserId]) {
      expect(await readEducationRespondentScaleReport({ actorUserId, executionId: rows[0].executionId, product: 'SCHOOL' })).toBeNull()
    }
  }, 60_000)
})
