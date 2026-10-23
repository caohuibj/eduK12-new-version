import { randomUUID } from 'node:crypto'
import express from 'express'
import type { Server } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { setupPrivateScaleExecutionFixture } from './educationPrivateScaleExecutionFixture'
import { completeEducationLibraryScaleExecution } from './educationLibraryReportFixture'
import { readEducationRespondentScaleReport } from '../../modules/reporting/education-scale-personal-report.service'
import { readCampusStudentFeedback } from '../../modules/campus/student-feedback'
import { readTeacherPersonalScaleReport } from '../../modules/huiteacher/scalePersonalReport.service'
import { readPrivateToolImage } from '../../modules/education-tools/private-tool.media'
import { updatePrivateTool, freezePrivateTool } from '../../modules/education-tools/private-tool.service'
import { readEducationScaleExecutionSource } from '../../modules/assessment-run/educationScaleExecutionSource'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { acceptRunExecutionConsent } from '../../modules/assessment-run/consent'

// Only HTTP identity transport and external storage bytes are mocked. Version
// pins, current task authority, START, scoring, FINAL and image selection are real.
vi.mock('../../middleware/auth', () => {
  const auth = (defaultRole: string) => (req: any, res: any, next: any) => {
    if (!req.headers['x-fixture-user']) return res.status(401).end()
    req.user = { userId: req.headers['x-fixture-user'], role: req.headers['x-fixture-role'] ?? defaultRole,
      accountDomain: 'SCHOOL', platformRole: 'STANDARD' }; next()
  }
  return { authenticateSchool: auth('STUDENT'), authenticateHuiteacher: auth('TEACHER') }
})
vi.mock('../../modules/assessment-media/assessment-image-delivery', async importOriginal => ({
  ...await importOriginal<typeof import('../../modules/assessment-media/assessment-image-delivery')>(),
  serveAssessmentImageContent: async ({ res }: any) => res.type('image/png').send('synthetic-private-image-transport'),
}))
import { educationSchoolScaleReportRouter, educationTeacherScaleReportRouter } from '../../modules/reporting/education-scale-report.routes'
const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'), suite = url ? describe : describe.skip
let db: PrismaClient, server: Server, base: string
suite('Private fixed-version education actual FINAL and report privacy', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    process.env.DATA_ENCRYPTION_KEY ||= '55'.repeat(32)
    process.env.DATA_PSEUDONYM_KEY ||= '56'.repeat(32)
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY ||= '57'.repeat(32)
    db = new PrismaClient({ datasources: { db: { url: url! } } }); await db.$connect()
    const app = express(); app.use('/school', educationSchoolScaleReportRouter); app.use('/teacher', educationTeacherScaleReportRouter)
    app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode ?? 500).json({ code: error.code ?? 'ERROR' }))
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve))
    base = 'http://127.0.0.1:' + (server.address() as { port: number }).port
  })
  afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); await db?.$disconnect() })
  it.each(['SCHOOL', 'TEACHER'] as const)('%s preserves actual FINAL feedback and version-pinned image after author edits/revocation, never broadens report rights', async product => {
    const f = await setupPrivateScaleExecutionFixture(db, product)
    // Published task use is not the author's current editing permission.
    const nextDefinition = structuredClone(f.privateDefinition)
    nextDefinition.report.reportVersion = 'private-v2'
    nextDefinition.report.rawScoreFeedback!.rules[0].ranges[0].text = '新版不得覆盖旧版报告'
    delete nextDefinition.report.rawScoreFeedback!.rules[0].ranges[0].images
    const next = await updatePrivateTool(f.privateContext, f.privateDraft.id, { expectedRevision: f.privateDraft.revision,
      title: 'New private version', definition: nextDefinition })
    const version2 = await freezePrivateTool(f.privateContext, f.privateDraft.id, { expectedRevision: next.revision, expectedContentHash: next.contentHash })
    expect(version2.id).not.toBe(f.privateVersion.id)
    expect(await db.assetReference.count({ where: { entityType: 'EducationPrivateToolVersion', entityId: f.privateVersion.id,
      field: 'reports', assetId: f.reportImage.assetId } })).toBe(1)
    const member = await db.organizationMembership.findFirstOrThrow({ where: { organizationId: f.organizationId, userId: f.managerUserId, validUntil: null } })
    await db.organizationCapabilityGrant.updateMany({ where: { membershipId: member.id, capability: 'PSYCHOLOGY_STAFF', revokedAt: null }, data: { revokedAt: new Date() } })
    const finished = await completeEducationLibraryScaleExecution({ db, actorUserId: f.participantUserId,
      executionId: f.executionId, answers: f.answers })
    expect(finished.finalUnit.sourceAttemptId).toBe(finished.child.id)
    const identityInput = { product, organizationId: f.organizationId, resourceKey: f.track.resourceKey,
      resourceVersion: f.track.resourceVersion, purpose: 'HISTORY' as const }
    const source = await db.$transaction(tx => readEducationScaleExecutionSource(tx, identityInput))
    expect(source).toMatchObject({ sourceKind: 'AUTHOR_PRIVATE', compositeItemId: finished.child.compositeItemId,
      sourceDefinitionHash: canonicalHash(f.privateDefinition), origin: { versionId: f.privateVersion.id, contentHash: f.privateVersion.contentHash } })
    await expect(db.$transaction(tx => readEducationScaleExecutionSource(tx, { ...identityInput, organizationId: randomUUID() })))
      .rejects.toThrow('PRIVATE_TOOL_RUNTIME_EXECUTION_SCOPE_MISMATCH')
    await expect(db.$transaction(tx => readEducationScaleExecutionSource(tx, { ...identityInput, product: product === 'SCHOOL' ? 'TEACHER' : 'SCHOOL' })))
      .rejects.toThrow('PRIVATE_TOOL_RUNTIME_EXECUTION_SCOPE_MISMATCH')
    const input = { actorUserId: f.participantUserId, executionId: f.executionId, product }
    const report = await readEducationRespondentScaleReport(input)
    expect(report).toMatchObject({ state: 'READY', mode: 'INDIVIDUAL_SUMMARY' })
    expect(JSON.stringify(report)).toContain('固定私有版本描述反馈，不是诊断。')
    expect(JSON.stringify(report)).toContain(f.reportImage.assetId)
    expect(JSON.stringify(report)).not.toContain(f.stimulus.assetId)
    const legacy = product === 'SCHOOL' ? await readCampusStudentFeedback(f.participantUserId, f.executionId)
      : await readTeacherPersonalScaleReport({ actorUserId: f.participantUserId, executionId: f.executionId })
    expect(legacy).toEqual(report)
    const endpoint = `${base}/${product.toLowerCase()}/library-scale/executions/${f.executionId}/report`
    const headers = { 'x-fixture-user': f.participantUserId }
    expect((await fetch(endpoint, { headers })).status).toBe(200)
    expect((await fetch(endpoint + '/images/' + f.reportImage.assetId, { headers })).status).toBe(200)
    expect((await fetch(endpoint + '/images/' + f.stimulus.assetId, { headers })).status).toBe(404)
    expect((await fetch(endpoint + '/images/' + randomUUID(), { headers })).status).toBe(404)
    expect((await fetch(endpoint + '/images/' + f.reportImage.assetId, { headers: { 'x-fixture-user': f.managerUserId } })).status).toBe(404)
    await expect(readPrivateToolImage({ ...f.privateContext, principal: { userId: f.participantUserId, accountDomain: 'SCHOOL' } },
      f.privateDraft.id, f.reportImage.assetId)).rejects.toThrow()
    expect(await readEducationRespondentScaleReport(input)).toEqual(report)
    expect((await fetch(endpoint + '/images/' + f.reportImage.assetId, { headers })).status).toBe(200)
    expect((await db.assessmentUnitSnapshot.findUniqueOrThrow({ where: { id: finished.finalUnit.id } })).sourceDefinitionHash).toBe(finished.finalUnit.sourceDefinitionHash)
    await db.organizationAccessDeny.create({ data: { id: randomUUID(), organizationId: f.organizationId, userId: f.participantUserId,
      permission: 'REPORT_READ', reason: 'Synthetic report read deny', deniedByUserId: f.managerUserId } })
    expect((await fetch(endpoint, { headers })).status).toBe(404)
    expect((await fetch(endpoint + '/images/' + f.reportImage.assetId, { headers })).status).toBe(404)
  }, 90_000)
  it.each(['PARENT_REPORT', 'TEACHER_REPORT'] as const)('keeps private %s actual completion NONE for observer, subject and publisher', async responseMode => {
    const f = await setupPrivateScaleExecutionFixture(db, 'SCHOOL', responseMode)
    const [assignment] = await db.$queryRaw<Array<{ consentId: string | null; policy: any }>>`
      SELECT a.consent_id AS "consentId", t.frozen_resource_policy AS policy FROM assessment_run_executions e
      JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id JOIN assessment_run_tracks t ON t.id=e.track_id
      WHERE e.id=${f.executionId}`
    expect(assignment.consentId).toBeTruthy()
    expect(Object.values(assignment.policy.resultDisclosure.audiences).every((rule: any) => rule.mode === 'NONE')).toBe(true)
    expect(await acceptRunExecutionConsent({ executionId: f.executionId, actorUserId: f.participantUserId })).toMatchObject({ accepted: true })
    const finished = await completeEducationLibraryScaleExecution({ db, actorUserId: f.participantUserId, executionId: f.executionId, answers: f.answers })
    expect(finished.parent.respondentUserId).toBe(f.participantUserId)
    expect(finished.parent.subjectUserId).toBe(f.subjectUserId)
    const endpoint = `${base}/school/library-scale/executions/${f.executionId}/report`
    for (const [userId, role] of [[f.participantUserId, responseMode === 'PARENT_REPORT' ? 'PARENT' : 'TEACHER'],
      [f.subjectUserId, 'STUDENT'], [f.managerUserId, 'TEACHER']]) {
      expect(await readEducationRespondentScaleReport({ actorUserId: userId, executionId: f.executionId, product: 'SCHOOL' })).toBeNull()
      const headers = { 'x-fixture-user': userId, 'x-fixture-role': role }
      expect((await fetch(endpoint, { headers })).status).toBe(404)
      expect((await fetch(endpoint + '/images/' + f.reportImage.assetId, { headers })).status).toBe(404)
    }
  }, 90_000)
})
