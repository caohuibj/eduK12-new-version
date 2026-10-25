import { randomUUID } from 'node:crypto'
import express from 'express'
import type { Server } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { setupEducationLibraryRuntimeFixture } from './educationLibraryRuntimeFixture'
import { completeEducationLibraryScaleExecution } from './educationLibraryReportFixture'
import { readEducationRespondentScaleReport } from '../../modules/reporting/education-scale-personal-report.service'
import { revokeUse } from '../../modules/scale-library-governance/distribution'
import { publishScaleMeasurement } from '../../modules/measurement-content/scale'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { prepareMediaManifest, submit, review, stopCollection } from '../../modules/scale-library-governance/service'

// Only the HTTP identity transport and external image bytes are mocked. All
// account, membership, task, frozen source, FINAL and report gates use real PG.
vi.mock('../../middleware/auth', () => {
  const auth = (role: string) => (req: any, res: any, next: any) => {
    if (!req.headers['x-fixture-user']) return res.status(401).end()
    req.user = { userId: req.headers['x-fixture-user'], role, accountDomain: 'SCHOOL', platformRole: 'STANDARD' }; next()
  }
  return { authenticateSchool: auth('STUDENT'), authenticateHuiteacher: auth('TEACHER') }
})
vi.mock('../../modules/assessment-media/assessment-image-delivery', async importOriginal => ({
  ...await importOriginal<typeof import('../../modules/assessment-media/assessment-image-delivery')>(),
  serveAssessmentImageContent: async ({ res }: any) => res.type('image/png').send('synthetic-image-transport'),
}))
import { educationSchoolScaleReportRouter, educationTeacherScaleReportRouter } from '../../modules/reporting/education-scale-report.routes'
const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'), suite = url ? describe : describe.skip
let db: PrismaClient, server: Server, base: string
suite('Education library real START→FINAL→personal report and image authorization', () => {
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
  it.each(['SCHOOL', 'TEACHER'] as const)('reads %s self feedback from real FINAL and enforces identical current image access', async product => {
    const fixture = await setupEducationLibraryRuntimeFixture({ db, product, withReportImage: true })
    if (!fixture.executionId || !fixture.imageReference) throw new Error('Real published execution and approved image are required')
    const finished = await completeEducationLibraryScaleExecution({ db, actorUserId: fixture.participantUserId,
      executionId: fixture.executionId, answers: fixture.answers })
    expect(finished.finalUnit.sourceAttemptId).toBe(finished.child.id)
    const input = { actorUserId: fixture.participantUserId, executionId: fixture.executionId, product }
    const report = await readEducationRespondentScaleReport(input)
    expect(report).toMatchObject({ state: 'READY', mode: 'INDIVIDUAL_SUMMARY' })
    if (report?.state !== 'READY') throw new Error('Approved self report was withheld')
    const feedback = (report.unitReports[0] as any).rawScoreFeedback
    expect(feedback).toEqual(expect.arrayContaining([expect.objectContaining({ scoreKey: 'support',
      text: '本次支持体验仅用于自我反思，不是诊断。', images: [expect.objectContaining({ asset: fixture.imageReference })] })]))
    expect(JSON.stringify(report)).not.toMatch(/respondentUserId|subjectUserId|responseValue|rawAnswers/)
    const endpoint = `${base}/${product.toLowerCase()}/library-scale/executions/${fixture.executionId}/report`
    const headers = { 'x-fixture-user': fixture.participantUserId }
    expect((await fetch(endpoint, { headers })).status).toBe(200)
    const image = await fetch(endpoint + '/images/' + fixture.imageReference.assetId, { headers })
    expect(image.status).toBe(200); expect(image.headers.get('cache-control')).toContain('no-store')
    expect(await image.text()).toBe('synthetic-image-transport')
    expect((await fetch(endpoint + '/images/' + randomUUID(), { headers })).status).toBe(404)
    expect((await fetch(endpoint, { headers: { 'x-fixture-user': fixture.managerUserId } })).status).toBe(404)
    expect((await fetch(endpoint + '/images/' + fixture.imageReference.assetId, { headers: { 'x-fixture-user': fixture.managerUserId } })).status).toBe(404)
    // Distribution revocation stops future use, not existing result readership.
    await revokeUse(fixture.libraryAdminUserId, fixture.grantId, { expectedVersion: 1, reason: 'Synthetic future-use revoke' })
    expect(await readEducationRespondentScaleReport(input)).toEqual(report)
    expect((await fetch(endpoint + '/images/' + fixture.imageReference.assetId, { headers })).status).toBe(200)
    // Publishing and approving a genuinely newer source version must not
    // reinterpret completed results or their selected images from the old entry.
    const nextDefinition = structuredClone(fixture.definition)
    nextDefinition.report.reportVersion = 'synthetic-report-v2'
    nextDefinition.report.rawScoreFeedback!.rules[0].ranges[0].text = '新版文字，不得进入旧报告'
    const nextRelease = await db.$transaction(async tx => {
      await tx.scale.update({ where: { id: fixture.sourceScaleId }, data: { definition: nextDefinition,
        definitionHash: hashScaleDefinition(nextDefinition), instrumentVersion: '2' } })
      const release = await publishScaleMeasurement(tx, { localId: fixture.sourceScaleId,
        version: 'synthetic-registration-v2', instrumentVersion: '2', definition: nextDefinition,
        instrumentClass: 'CUSTOM_DESCRIPTIVE', scope: { kind: 'PRIVATE', product: 'TRAINING',
          ownerId: fixture.authorUserId, resourceId: fixture.sourceScaleId } }, fixture.authorUserId)
      await tx.scale.update({ where: { id: fixture.sourceScaleId }, data: { measurementReleaseId: release.releaseId } })
      return release
    })
    const manifest = await prepareMediaManifest(fixture.authorUserId, 'TRAINING', { releaseId: nextRelease.releaseId, dependencyReleaseIds: [] })
    const nextApplication = await submit(fixture.authorUserId, 'TRAINING', { requestId: randomUUID(), releaseId: nextRelease.releaseId,
      metadata: { title: '新版合成量表', author: 'Synthetic author', copyright: 'Self authored; redistribution allowed',
        applicability: 'Synthetic isolated test', scoringDescription: 'One score', reportDescription: 'New descriptive version' },
      educationApplicability: { schemaVersion: 1, administrations: [{ population: product === 'SCHOOL' ? 'STUDENT' : 'TEACHER', responseMode: 'SELF' }] },
      mediaConsent: { manifestHash: manifest.mediaManifest.manifestHash, shareWithAuthorizedUsers: true } })
    const nextApproved = await review(fixture.libraryAdminUserId, nextApplication.id, { expectedVersion: 1, decision: 'APPROVE', allowedProducts: ['TRAINING', 'SURVEY'], reason: 'Synthetic newer version' })
    expect(nextApproved.entryId).not.toBe(fixture.entryId)
    expect(await readEducationRespondentScaleReport(input)).toEqual(report)
    expect((await db.assessmentUnitSnapshot.findFirstOrThrow({ where: { id: finished.finalUnit.id } })).sourceDefinitionHash)
      .toBe(finished.finalUnit.sourceDefinitionHash)
    // Collection/START controls are not report-read permissions. The production
    // REPORT_READ purpose must preserve completed history while still applying
    // current account, assignment and explicit report denies below.
    const startDeny = await db.organizationAccessDeny.create({ data: { id: randomUUID(), organizationId: fixture.organizationId,
      userId: fixture.participantUserId, permission: 'RUN_START', reason: 'Synthetic collection-only deny', deniedByUserId: fixture.managerUserId } })
    try {
      expect(await readEducationRespondentScaleReport(input)).toEqual(report)
      expect((await fetch(endpoint + '/images/' + fixture.imageReference.assetId, { headers })).status).toBe(200)
    } finally { await db.organizationAccessDeny.update({ where: { id: startDeny.id }, data: { liftedAt: new Date(), liftedByUserId: fixture.managerUserId } }) }
    await db.$transaction(tx => stopCollection(tx, fixture.libraryAdminUserId, 'RELEASE', fixture.release.releaseId, 'Synthetic stop new collection'))
    expect(await readEducationRespondentScaleReport(input)).toEqual(report)
    expect((await fetch(endpoint + '/images/' + fixture.imageReference.assetId, { headers })).status).toBe(200)
    const deny = await db.organizationAccessDeny.create({ data: { id: randomUUID(), organizationId: fixture.organizationId,
      userId: fixture.participantUserId, permission: 'REPORT_READ', reason: 'Synthetic current report revoke', deniedByUserId: fixture.managerUserId } })
    try {
      expect((await fetch(endpoint, { headers })).status).toBe(404)
      expect((await fetch(endpoint + '/images/' + fixture.imageReference.assetId, { headers })).status).toBe(404)
    } finally { await db.organizationAccessDeny.update({ where: { id: deny.id }, data: { liftedAt: new Date(), liftedByUserId: fixture.managerUserId } }) }
  }, 30000)
  it('does not invent personal text or image rights for a version with no content audience', async () => {
    const fixture = await setupEducationLibraryRuntimeFixture({ db, product: 'TEACHER', withReportImage: true, contentAudience: null })
    if (!fixture.executionId) throw new Error('Real published execution required')
    await completeEducationLibraryScaleExecution({ db, actorUserId: fixture.participantUserId, executionId: fixture.executionId, answers: fixture.answers })
    const report = await readEducationRespondentScaleReport({ product: 'TEACHER', actorUserId: fixture.participantUserId, executionId: fixture.executionId })
    expect(report).toMatchObject({ state: 'WITHHELD', mode: 'NONE' }); expect(report).not.toHaveProperty('unitReports')
    const endpoint = `${base}/teacher/library-scale/executions/${fixture.executionId}/report/images/${fixture.imageReference!.assetId}`
    expect((await fetch(endpoint, { headers: { 'x-fixture-user': fixture.participantUserId } })).status).toBe(404)
  }, 30000)
})
