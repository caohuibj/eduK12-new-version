import express from 'express'
import type { Server } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { setupEducationLibraryRuntimeFixture } from './educationLibraryRuntimeFixture'
import { completeEducationLibraryScaleExecution } from './educationLibraryReportFixture'
import { acceptRunExecutionConsent } from '../../modules/assessment-run/consent'
import { readEducationRespondentScaleReport } from '../../modules/reporting/education-scale-personal-report.service'

// Only HTTP identity transport is synthetic; account, relationship, consent,
// publication, START, FINAL and report rights all use the isolated real database.
vi.mock('../../middleware/auth', () => ({
  authenticateSchool: (req: any, res: any, next: any) => {
    if (!req.headers['x-fixture-user']) return res.status(401).end()
    req.user = { userId: req.headers['x-fixture-user'], role: req.headers['x-fixture-role'], accountDomain: 'SCHOOL' }; next()
  },
  authenticateHuiteacher: (_req: any, res: any) => res.status(401).end(),
}))
import { educationSchoolScaleReportRouter } from '../../modules/reporting/education-scale-report.routes'
const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'), suite = url ? describe : describe.skip
let db: PrismaClient, server: Server, base: string
suite('School approved library observer real completion and report privacy', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    process.env.DATA_ENCRYPTION_KEY ||= '55'.repeat(32)
    process.env.DATA_PSEUDONYM_KEY ||= '56'.repeat(32)
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY ||= '57'.repeat(32)
    db = new PrismaClient({ datasources: { db: { url: url! } } }); await db.$connect()
    const app = express(); app.use('/school', educationSchoolScaleReportRouter)
    app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode ?? 500).json({ code: error.code ?? 'ERROR' }))
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve))
    base = 'http://127.0.0.1:' + (server.address() as { port: number }).port
  })
  afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); await db?.$disconnect() })
  it.each(['PARENT_REPORT', 'TEACHER_REPORT'] as const)('completes %s with real relationship/consent and no individual report disclosure', async responseMode => {
    const f = await setupEducationLibraryRuntimeFixture({ db, product: 'SCHOOL', responseMode, withReportImage: true })
    if (!f.executionId || !f.imageReference) throw new Error('Real observer execution and approved report image required')
    expect(f.participantUserId).not.toBe(f.subjectUserId)
    const [assignment] = await db.$queryRaw<Array<{ subjectUserId: string; respondentUserId: string; consentId: string | null; policy: any }>>`
      SELECT a.subject_user_id AS "subjectUserId", a.respondent_user_id AS "respondentUserId", a.consent_id AS "consentId", t.frozen_resource_policy AS policy
      FROM assessment_run_executions e JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id
      JOIN assessment_run_tracks t ON t.id=e.track_id WHERE e.id=${f.executionId}`
    expect(assignment.subjectUserId).toBe(f.subjectUserId)
    expect(assignment.respondentUserId).toBe(f.participantUserId)
    expect(Object.values(assignment.policy.resultDisclosure.audiences).every((rule: any) => rule.mode === 'NONE')).toBe(true)
    if (responseMode === 'PARENT_REPORT') expect(assignment.consentId).toBeTruthy()
    if (assignment.consentId) expect(await acceptRunExecutionConsent({ executionId: f.executionId, actorUserId: f.participantUserId })).toMatchObject({ accepted: true })
    const completed = await completeEducationLibraryScaleExecution({ db, actorUserId: f.participantUserId, executionId: f.executionId, answers: f.answers })
    expect(completed.parent.subjectUserId).toBe(f.subjectUserId)
    expect(completed.parent.respondentUserId).toBe(f.participantUserId)
    expect(completed.finalUnit.sourceAttemptId).toBe(completed.child.id)
    expect(await readEducationRespondentScaleReport({ actorUserId: f.participantUserId, executionId: f.executionId, product: 'SCHOOL' })).toBeNull()
    const endpoint = `${base}/school/library-scale/executions/${f.executionId}/report`
    for (const [userId, role] of [[f.participantUserId, responseMode === 'PARENT_REPORT' ? 'PARENT' : 'TEACHER'], [f.subjectUserId, 'STUDENT']] as const) {
      const headers = { 'x-fixture-user': userId, 'x-fixture-role': role }
      expect((await fetch(endpoint, { headers })).status).toBe(404)
      expect((await fetch(endpoint + '/images/' + f.imageReference.assetId, { headers })).status).toBe(404)
    }
  }, 60_000)
})
