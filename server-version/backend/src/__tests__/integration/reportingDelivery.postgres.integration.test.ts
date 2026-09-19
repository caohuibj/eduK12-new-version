import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import express from 'express'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { buildReportingFixture } from './reporting-fixture'
import { createPlatformReportingSpec, reviewPlatformReportingSpec, publishPlatformReportingSpec } from '../../modules/reporting/spec'
import { generateOrganizationProtectedFeedback, readOrganizationReportingArtifact } from '../../modules/reporting/pr4Service'
import { generateOrganizationGroupAnalysis } from '../../modules/reporting/service'
import { createReportingExport, downloadReportingExport, csvCell } from '../../modules/reporting/export'
import { readOrganizationSafetyCase } from '../../modules/assessment-safety/organization-view'
import { parseStoredCanonicalUnitResult } from '../../modules/assessment-runtime/persistence'
import { createMembership, grantCapability, grantPersona, revokeCapability, suspendOrganization, resumeOrganization } from '../../modules/organization/service'
import { createOrganizationUnit } from '../../modules/organization/structure'
import { assignStaffToClass, assignStudentToClass, endStaffClassAssignment } from '../../modules/organization/classRelationships'
import organizationRoutes from '../../modules/organization/organization.routes'
import { csrfProtection } from '../../middleware/csrf'
import { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../utils/authCookies'
import { generateToken } from '../../utils/jwt'

const DB_URL = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL')
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
let server: Server
let baseUrl: string
const meta = (userId: string) => ({ actorUserId: userId, commandKey: randomUUID() })

suite('PR4 delivery, Safety and CSV authority gate (real PostgreSQL/HTTP)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    const app = express()
    app.use(express.json())
    app.use('/api', csrfProtection)
    app.use('/api/organizations', organizationRoutes)
    server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('missing HTTP address')
    baseUrl = `http://127.0.0.1:${address.port}`
  })
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await db.$disconnect()
  })

  it('requires read plus explicit export grant, reauthorizes download, and limits Safety to current responsibility', async () => {
    const fixture = await buildReportingFixture(db, 3)
    const owner = await db.user.update({ where: { id: fixture.ownerId }, data: { platformRole: 'SYSTEM_ADMIN' } })
    const principal = { userId: owner.id, platformRole: 'SYSTEM_ADMIN' as const }
    const orgId = fixture.organizationId
    const membership = await createMembership({ organizationId: orgId, userId: owner.id, orgRole: 'ORG_ADMIN', meta: meta(owner.id) })
    const spec = await createPlatformReportingSpec({ actor: principal, specKey: randomUUID(), version: 1, definition: {
      schemaVersion: 1, analysisKind: 'GROUP', engineKey: 'ORG_GROUP_V1', engineVersion: '1.0.0', privacyUnit: 'SUBJECT',
      selectionPolicy: 'UNIQUE_OR_REJECT', minimumCohortN: 3, minimumContributorN: 3, reportEvidenceCeiling: 'PILOT',
      metricRules: [{ metricId: 'score', sourceMetricKey: 'score', acceptedResultQuality: ['interpretable'],
        acceptedMetricQuality: 'IGNORE_METRIC_QUALITY', aggregations: ['MEAN'], missingnessRule: 'EXCLUDE',
        minimumMetricN: 3, observationUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT' }],
    } })
    await reviewPlatformReportingSpec({ actor: principal, specId: spec.id })
    await publishPlatformReportingSpec({ actor: principal, specId: spec.id })
    const artifact = await generateOrganizationGroupAnalysis({ principal, organizationId: orgId, runId: fixture.runId, trackId: fixture.trackId, specId: spec.id })
    expect(artifact.projection.state).toBe('present')
    const exportInput = { principal, organizationId: orgId, target: { kind: 'AGGREGATE' as const, artifactId: artifact.artifactId } }
    await expect(createReportingExport(exportInput)).rejects.toMatchObject({ code: 'EXPORT_NOT_ALLOWED' })
    await grantCapability({ organizationId: orgId, membershipId: membership.id, capability: 'REPORT_EXPORT', meta: meta(owner.id) })
    const ticket = await createReportingExport(exportInput)
    const downloaded = await downloadReportingExport({ principal, organizationId: orgId, exportId: ticket.exportId })
    expect(downloaded.csv).toContain('mean')
    expect(downloaded.csv).not.toContain('canonicalResultHash')
    await expect(downloadReportingExport({ principal: { userId: fixture.members[0].userId, platformRole: 'STANDARD' }, organizationId: orgId, exportId: ticket.exportId }))
      .rejects.toMatchObject({ code: 'REPORT_EXPORT_NOT_FOUND' })
    await revokeCapability({ organizationId: orgId, membershipId: membership.id, capability: 'REPORT_EXPORT', meta: meta(owner.id) })
    await expect(downloadReportingExport({ principal, organizationId: orgId, exportId: ticket.exportId }))
      .rejects.toMatchObject({ code: 'EXPORT_NOT_ALLOWED' })
    await grantCapability({ organizationId: orgId, membershipId: membership.id, capability: 'REPORT_MEMBER_EXPORT', meta: meta(owner.id) })
    await expect(createReportingExport({ ...exportInput, target: { kind: 'MEMBER', artifactId: artifact.artifactId } }))
      .rejects.toMatchObject({ code: 'EXPORT_NOT_ALLOWED' })

    const snapshot = await db.assessmentUnitSnapshot.findFirstOrThrow({ where: { compositeAttemptId: fixture.members[0].attemptId } })
    const canonical = parseStoredCanonicalUnitResult(snapshot.canonicalResultEncrypted!)
    const caseRow = await db.safetyCase.create({ data: {
      policyKey: 'pr4-test', policyVersion: '1.0.0', subjectUserId: fixture.members[0].userId,
      primaryOwnerUserId: owner.id, backupOwnerUserIds: [], triggerSourceKind: 'CANONICAL_UNIT_RESULT',
      triggerSourceRecordId: snapshot.id, triggerSourceHash: canonical.resultHash,
      triggerNotesJson: ['sensitive internal note'], idempotencyKey: randomUUID(),
      ackDueAt: new Date(Date.now() + 60000), disposeDueAt: new Date(Date.now() + 120000),
    } })
    const caseInput = { principal, organizationId: orgId, caseId: caseRow.id }
    const summary = await readOrganizationSafetyCase(caseInput)
    expect(summary.projection).toBe('SUMMARY')
    expect(summary.data).not.toHaveProperty('subjectUserId')
    expect(summary.data).not.toHaveProperty('events')
    await grantCapability({ organizationId: orgId, membershipId: membership.id, capability: 'REPORT_EXPORT', meta: meta(owner.id) })
    const safetyTicket = await createReportingExport({ principal, organizationId: orgId, target: { kind: 'SAFETY', caseId: caseRow.id } })
    expect((await downloadReportingExport({ principal, organizationId: orgId, exportId: safetyTicket.exportId })).csv).not.toContain('sensitive')
    await grantPersona({ organizationId: orgId, membershipId: membership.id, persona: 'TEACHER', meta: meta(owner.id) })
    expect((await readOrganizationSafetyCase(caseInput)).projection).toBe('ACTION')
    const grade = await createOrganizationUnit({ organizationId: orgId, unitKind: 'GRADE', name: 'Test grade' })
    const classroom = await createOrganizationUnit({ organizationId: orgId, unitKind: 'CLASS', name: 'Test class', parentUnitId: grade.id })
    const staff = await assignStaffToClass({ organizationId: orgId, membershipId: membership.id, classUnitId: classroom.id, staffRole: 'HOMEROOM' })
    for (const member of fixture.members) {
      await grantPersona({ organizationId: orgId, membershipId: member.membershipId, persona: 'STUDENT', meta: meta(owner.id) })
      await assignStudentToClass({ organizationId: orgId, membershipId: member.membershipId, classUnitId: classroom.id })
    }
    const memberTicket = await createReportingExport({ ...exportInput, target: { kind: 'MEMBER', artifactId: artifact.artifactId } })
    const memberCsv = await downloadReportingExport({ principal, organizationId: orgId, exportId: memberTicket.exportId })
    for (const member of fixture.members) expect(memberCsv.csv).toContain(member.userId)
    await endStaffClassAssignment({ organizationId: orgId, assignmentId: staff.id })
    await expect(downloadReportingExport({ principal, organizationId: orgId, exportId: memberTicket.exportId })).rejects.toMatchObject({ code: 'EXPORT_NOT_ALLOWED' })

    await grantCapability({ organizationId: orgId, membershipId: membership.id, capability: 'PSYCHOLOGY_STAFF', meta: meta(owner.id) })
    expect((await readOrganizationSafetyCase(caseInput)).projection).toBe('FULL')
    await suspendOrganization({ organizationId: orgId, meta: meta(owner.id) })
    expect((await readOrganizationSafetyCase(caseInput)).projection).toBe('FULL')
    await expect(createReportingExport(exportInput)).rejects.toMatchObject({ code: 'EXPORT_NOT_ALLOWED' })
    await revokeCapability({ organizationId: orgId, membershipId: membership.id, capability: 'PSYCHOLOGY_STAFF', meta: meta(owner.id) })
    expect((await readOrganizationSafetyCase(caseInput)).projection).toBe('ACTION')
    await db.safetyCase.update({ where: { id: caseRow.id }, data: { primaryOwnerUserId: fixture.members[1].userId } })
    await expect(readOrganizationSafetyCase(caseInput)).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
    await resumeOrganization({ organizationId: orgId, meta: meta(owner.id) })
    await expect(readOrganizationSafetyCase({ ...caseInput, principal: { userId: fixture.members[0].userId, platformRole: 'STANDARD' } }))
      .rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
    await expect(readOrganizationSafetyCase({ ...caseInput, organizationId: randomUUID() })).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })

    const token = generateToken({ userId: owner.id, username: owner.username, role: owner.role, tokenVersion: owner.tokenVersion })
    const headers = { 'content-type': 'application/json', cookie: `${AUTH_COOKIE_NAME}=${token}; ${CSRF_COOKIE_NAME}=pr4-csrf`, [CSRF_HEADER_NAME]: 'pr4-csrf' }
    const response = await fetch(`${baseUrl}/api/organizations/${orgId}/reporting/exports`, { method: 'POST', headers, body: JSON.stringify(exportInput.target) })
    expect(response.status).toBe(200)
    const body = await response.json() as { data: { exportId: string } }
    const csv = await fetch(`${baseUrl}/api/organizations/${orgId}/reporting/exports/${body.data.exportId}`, { headers })
    expect(csv.status).toBe(200)
    expect(csv.headers.get('cache-control')).toBe('no-store')
    expect(csv.headers.get('content-type')).toContain('text/csv')
    const safetyResponse = await fetch(`${baseUrl}/api/organizations/${orgId}/safety/cases/${caseRow.id}`, { headers })
    expect(safetyResponse.status).toBe(200)
    expect((await safetyResponse.json() as { data: { projection: string } }).data.projection).toBe('SUMMARY')
    expect(csvCell(' \t=HYPERLINK("bad")')).toBe('"\' \t=HYPERLINK(""bad"")"')
  })
  it('persists protected feedback, denies even administrator subjects and excludes respondent identities from exports', async () => {
    const fixture = await buildReportingFixture(db, 3, true)
    const manager = await db.user.create({ data: { username: `pr4-manager-${randomUUID()}`, passwordHash: 'test', role: 'ADMIN', platformRole: 'SYSTEM_ADMIN' } })
    const principal = { userId: manager.id, platformRole: 'SYSTEM_ADMIN' as const }
    const organizationId = fixture.organizationId
    const membership = await createMembership({ organizationId, userId: manager.id, orgRole: 'ORG_ADMIN', meta: meta(manager.id) })
    const [track] = await db.$queryRaw<Array<{ key: string }>>`SELECT resource_key AS key FROM assessment_run_tracks WHERE id=${fixture.trackId}`
    const spec = await createPlatformReportingSpec({ actor: principal, specKey: randomUUID(), version: 1, definition: {
      schemaVersion: 1, analysisKind: 'PROTECTED_FEEDBACK', engineKey: 'ORG_PROTECTED_FEEDBACK_V1', engineVersion: '1.0.0',
      privacyUnit: 'RESPONDENT', selectionPolicy: 'UNIQUE_OR_REJECT', minimumRespondentN: 3, minimumContributorN: 3,
      reportEvidenceCeiling: 'PILOT', metricRules: [{ metricId: 'score', sourceMetricKey: 'score',
        sourceFamily: 'BUNDLE', sourceResourceKey: track.key, valueType: 'NUMBER', longitudinalMetricKey: 'score',
        acceptedResultQuality: ['interpretable'], acceptedMetricQuality: 'IGNORE_METRIC_QUALITY', aggregations: ['MEAN'],
        missingnessRule: 'EXCLUDE', minimumMetricN: 3, observationUnit: 'RESPONDENT', selectionPolicy: 'UNIQUE_OR_REJECT' }],
    } })
    await reviewPlatformReportingSpec({ actor: principal, specId: spec.id })
    await publishPlatformReportingSpec({ actor: principal, specId: spec.id })
    const input = { principal, organizationId, runId: fixture.runId, trackId: fixture.trackId,
      subjectUserId: fixture.ownerId, relationshipKind: 'CLASS_TEACHER_STUDENT', perspective: 'RELATIONAL_EXPERIENCE' as const, specId: spec.id }
    const report = await generateOrganizationProtectedFeedback(input)
    expect(report.projection.state).toBe('present')
    const read = { principal, organizationId, artifactId: report.artifactId }
    expect(await readOrganizationReportingArtifact(read)).toEqual(report)
    const subject = { userId: fixture.ownerId, platformRole: 'SYSTEM_ADMIN' as const }
    await expect(readOrganizationReportingArtifact({ ...read, principal: subject })).rejects.toMatchObject({ code: 'SUBJECT_EXCLUDED' })
    await expect(generateOrganizationProtectedFeedback({ ...input, principal: subject })).rejects.toMatchObject({ code: 'SUBJECT_EXCLUDED' })
    await grantCapability({ organizationId, membershipId: membership.id, capability: 'REPORT_EXPORT', meta: meta(manager.id) })
    await grantCapability({ organizationId, membershipId: membership.id, capability: 'REPORT_MEMBER_EXPORT', meta: meta(manager.id) })
    const target = { kind: 'AGGREGATE' as const, artifactId: report.artifactId }
    await expect(createReportingExport({ principal: subject, organizationId, target })).rejects.toMatchObject({ code: 'SUBJECT_EXCLUDED' })
    await expect(createReportingExport({ principal, organizationId, target: { ...target, kind: 'MEMBER' } })).rejects.toMatchObject({ code: 'EXPORT_NOT_ALLOWED' })
    const ticket = await createReportingExport({ principal, organizationId, target })
    const { csv } = await downloadReportingExport({ principal, organizationId, exportId: ticket.exportId })
    expect(csv).toContain('mean')
    for (const member of fixture.members) expect(csv).not.toContain(member.userId)
    expect(csv).not.toContain('eligibleRespondentN')
  })

})
