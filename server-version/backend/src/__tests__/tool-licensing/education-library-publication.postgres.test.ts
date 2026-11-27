import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'
import { setupEducationLibraryRuntimeFixture } from '../integration/educationLibraryRuntimeFixture'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { loadFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { submitScaleAssessmentFinal } from '../../modules/scale/scale-final-submit.service'
import { toolLicenseKey } from '../../modules/tool-licensing/contracts'
import { createToolLicense, readToolLicense, readToolLicenseTerminationImpact, terminateToolLicense } from '../../modules/tool-licensing/management'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
let db: PrismaClient

suite('Standalone education library scale commercial publication in isolated PostgreSQL', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    vi.stubEnv('DATA_ENCRYPTION_KEY', '55'.repeat(32))
    vi.stubEnv('DATA_PSEUDONYM_KEY', '56'.repeat(32))
    vi.stubEnv('CAMPUS_ELIGIBILITY_HMAC_KEY', '57'.repeat(32))
    vi.stubEnv('SCHOOL_TOOL_LICENSING_ENABLED', 'true')
    vi.stubEnv('TEACHER_TOOL_LICENSING_ENABLED', 'true')
    db = new PrismaClient({ datasources: { db: { url: url! } } })
    await db.$connect()
  })
  afterAll(async () => { vi.unstubAllEnvs(); await db?.$disconnect() })

  it.each(['SCHOOL', 'TEACHER'] as const)('%s reserves by exact approved library key and keeps frozen work after termination', async product => {
    const fixture = await setupEducationLibraryRuntimeFixture({ db, product, trackCount: 2, publish: false })
    const systemAdmin = await db.user.create({ data: {
      username: 'tool-review-' + randomUUID().slice(0, 16), passwordHash: '-',
      accountDomain: 'TRAINING', role: 'ADMIN', platformRole: 'SYSTEM_ADMIN',
    } })
    const operator = () => ({
      actorUserId: systemAdmin.id, actorSession: { adminSessionId: randomUUID(), adminVerifiedAt: Math.floor(Date.now()/1000),
        adminAuthenticationMethod: 'TOTP' as const, tokenVersion: 0 },
    })
    const term = new Date(Date.now() + 120_000)
    const release = await db.measurementContentRelease.findUniqueOrThrow({ where: { id: fixture.release.releaseId } })
    const key = toolLicenseKey('SCALE', release.key)
    const license = await createToolLicense(operator(), {
      requestId: randomUUID(), product, subjectId: fixture.organizationId, reason: 'Synthetic library scale publication check',
      startsAt: new Date(Date.now() - 10_000).toISOString(), expiresAt: term.toISOString(), tools: [{ key, limit: 2 }],
    })
    await fixture.open()
    const publish = (maxResponses: number, intakeDeadline: Date) => publishAssessmentRun({
      organizationId: fixture.organizationId, runId: fixture.runId, actorUserId: fixture.managerUserId,
      expectedVersion: fixture.expectedVersion, maxResponses, intakeDeadline,
    })
    await expect(publish(1, new Date(Date.now() + 60_000))).rejects.toThrow('冻结')
    await expect(publish(2, new Date(term.getTime() + 1))).rejects.toThrow('到期')
    expect((await readToolLicense(license.id)).tools[0].used).toBe(0)
    expect((await publish(2, new Date(Date.now() + 60_000))).executionCount).toBe(2)
    expect((await readToolLicense(license.id)).tools[0].used).toBe(2)
    expect(await readToolLicenseTerminationImpact(license.id)).toMatchObject({ meteredPublications: 1, outstandingReservations: 1 })
    const executions = await fixture.executions()
    const start = (executionId: string) => startAssessmentRunExecution({ executionId, actorUserId: fixture.participantUserId })
    const admitted = await start(executions[0].id)
    if (admitted.state !== 'STARTED' || admitted.runtimeBindingKind !== 'COMPOSITE') throw Error('Expected a frozen library scale attempt')
    const parent = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: admitted.runtimeBindingRef } })
    const assessment = await db.assessment.findFirstOrThrow({ where: { compositeAttemptId: parent.id } })
    const frozen = await loadFrozenScaleRuntimeSnapshot(assessment.runtimeSnapshotEncrypted!, db)
    await terminateToolLicense(operator(), license.id, { expectedRevision: 1, reason: 'Synthetic commercial termination after admission' })
    expect(await start(executions[0].id)).toMatchObject({ runtimeBindingRef: parent.id })
    await submitScaleAssessmentFinal({
      assessmentId: assessment.id, submissionId: randomUUID(), attemptEpoch: assessment.attemptEpoch,
      definitionHash: frozen.legacyDefinitionHash, contextSnapshotHash: parent.contextSnapshotHash,
      userId: fixture.participantUserId, compositeAttemptId: parent.id, answers: fixture.answers,
    })
    expect((await db.assessment.findUniqueOrThrow({ where: { id: assessment.id } })).status).toBe('COMPLETED')
    expect(await start(executions[1].id)).toMatchObject({ state: 'STARTED' })
  }, 45_000)
})
