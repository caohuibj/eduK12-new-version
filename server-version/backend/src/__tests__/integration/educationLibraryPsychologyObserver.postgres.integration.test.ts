import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { setupEducationLibraryRuntimeFixture } from './educationLibraryRuntimeFixture'
import { completeEducationLibraryScaleExecution } from './educationLibraryReportFixture'
import { acceptRunExecutionConsent } from '../../modules/assessment-run/consent'
import { readEducationRespondentScaleReport } from '../../modules/reporting/education-scale-personal-report.service'
const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'), suite = url ? describe : describe.skip
let db: PrismaClient
suite('Psychologist own-activity approved library observer publication', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    process.env.DATA_ENCRYPTION_KEY ||= '55'.repeat(32)
    process.env.DATA_PSEUDONYM_KEY ||= '56'.repeat(32)
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY ||= '57'.repeat(32)
    db = new PrismaClient({ datasources: { db: { url: url! } } }); await db.$connect()
  })
  afterAll(async () => { await db?.$disconnect() })
  it.each(['PARENT_REPORT', 'TEACHER_REPORT'] as const)('publishes and completes %s without granting individual report access', async responseMode => {
    const f = await setupEducationLibraryRuntimeFixture({ db, product: 'SCHOOL', responseMode, publisher: 'PSYCHOLOGY', withReportImage: true })
    if (!f.executionId) throw new Error('A real psychologist-published execution is required')
    expect(f.managerUserId).not.toBe(f.schoolAdmin!.userId)
    const [assignment] = await db.$queryRaw<Array<{ subjectUserId: string; respondentUserId: string; consentId: string | null; policy: any }>>`
      SELECT a.subject_user_id AS "subjectUserId", a.respondent_user_id AS "respondentUserId", a.consent_id AS "consentId", t.frozen_resource_policy AS policy
      FROM assessment_run_executions e JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id
      JOIN assessment_run_tracks t ON t.id=e.track_id WHERE e.id=${f.executionId}`
    expect(assignment.subjectUserId).toBe(f.subjectUserId)
    expect(assignment.respondentUserId).toBe(f.participantUserId)
    expect(assignment.consentId).toBeTruthy()
    expect(Object.values(assignment.policy.resultDisclosure.audiences).every((rule: any) => rule.mode === 'NONE')).toBe(true)
    expect(await acceptRunExecutionConsent({ executionId: f.executionId, actorUserId: f.participantUserId })).toMatchObject({ accepted: true })
    const completed = await completeEducationLibraryScaleExecution({ db, actorUserId: f.participantUserId, executionId: f.executionId, answers: f.answers })
    expect(completed.parent.subjectUserId).toBe(f.subjectUserId)
    expect(completed.parent.respondentUserId).toBe(f.participantUserId)
    expect(completed.finalUnit.sourceAttemptId).toBe(completed.child.id)
    // Publication authority is not report readership. A null report cannot
    // supply feedback text or projected image references to any of these actors.
    for (const actorUserId of [f.managerUserId, f.participantUserId, f.subjectUserId]) {
      expect(await readEducationRespondentScaleReport({ actorUserId, executionId: f.executionId, product: 'SCHOOL' })).toBeNull()
    }
  }, 60_000)
})
