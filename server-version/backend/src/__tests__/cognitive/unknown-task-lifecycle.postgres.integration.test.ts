import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { integrationDatabaseUrl } from '../integration/integration-env'
// Extend only generated projections inside this test worker. No production registry hook.
vi.mock('../../modules/cognitive/generated/execution', async (original) => {
  const actual = await original<any>()
  const fixture = await import(
    './fixtures/onboarding/TEST_ONBOARDING_UNKNOWN_V1/package'
  )
  return {
    cognitiveExecutionEntries: [
      ...actual.cognitiveExecutionEntries,
      ...fixture.executionEntries,
    ],
  }
})
vi.mock('../../modules/cognitive/generated/presentation', async (original) => {
  const actual = await original<any>()
  const fixture = await import(
    './fixtures/onboarding/TEST_ONBOARDING_UNKNOWN_V1/participant-presentation'
  )
  return {
    cognitivePresentations: [
      ...actual.cognitivePresentations,
      ...fixture.participantPresentations,
    ],
  }
})
const url = integrationDatabaseUrl('COGNITIVE_INTEGRATION_DB_URL')
const suite = url ? describe : describe.skip
suite(
  'unknown package explicit release to authoritative FINAL (real PostgreSQL)',
  () => {
    let prisma: (typeof import('../../config/database'))['prisma'],
      userId: string,
      configId: string,
      courseId: string,
      assignmentId: string
    beforeEach(async () => {
      process.env.DATABASE_URL = url!
      prisma = (await import('../../config/database')).prisma
      const user = await prisma.user.create({
        data: {
          username: 'onboarding-' + randomUUID(),
          passwordHash: 'fixture',
          role: 'TEACHER',
        },
      })
      userId = user.id
      const course = await prisma.course.create({
        data: {
          title: 'Unknown onboarding',
          courseCode: randomUUID(),
          creatorId: userId,
        },
      })
      courseId = course.id
      await prisma.courseStudent.create({
        data: { courseId, studentId: userId, status: 'ACTIVE' },
      })
      const config = await prisma.cognitiveTestConfig.create({
        data: {
          testType: 'TEST_ONBOARDING_UNKNOWN_V1',
          configVersion: randomUUID(),
          name: 'Unknown onboarding test only',
          engineVersion: '1.0.0',
          scoringVersion: '1.0.0',
          status: 'DRAFT',
          config: { trialCount: 2 },
        },
      })
      configId = config.id
    })
    afterEach(async () => {
      if (assignmentId) {
        await prisma.cognitiveSession.deleteMany({ where: { assignmentId } })
        await prisma.cognitiveAssignment.deleteMany({
          where: { id: assignmentId },
        })
      }
      if (courseId) {
        await prisma.courseStudent.deleteMany({ where: { courseId } })
        await prisma.course.deleteMany({ where: { id: courseId } })
      }
      if (configId)
        await prisma.cognitiveTestConfig.deleteMany({ where: { id: configId } })
      if (userId) await prisma.user.deleteMany({ where: { id: userId } })
      await prisma?.$disconnect()
    })
    it.each(['UNIFIED_V1', 'legacy'])(
      '%s: explicitly publishes, freezes, submits FINAL idempotently, and reads the report',
      async (mode) => {
        const { publishCognitiveConfig } = await import(
          '../../modules/cognitive/release.service'
        )
        const { createAssignment, publishAssignment } = await import(
          '../../modules/cognitive/assignment.service'
        )
        const { createSession, getSession } = await import(
          '../../modules/cognitive/session.service'
        )
        const { submitCognitiveSessionFinal } = await import(
          '../../modules/cognitive/final-submit.service'
        )
        const { createTrialEnvelope } = await import(
          '../../modules/cognitive/v2/trial-envelope'
        )
        const input = {
          courseId,
          configId,
          title: 'Unknown',
          profile: 'standard' as const,
          maxAttempts: 1,
          required: true,
        }
        await expect(
          createAssignment(userId, 'TEACHER', input),
        ).rejects.toThrow('PUBLISHED')
        expect((await publishCognitiveConfig(configId)).status).toBe(
          'PUBLISHED',
        )
        const assignment = await createAssignment(userId, 'TEACHER', input)
        assignmentId = assignment.id
        await expect(createSession(userId, assignmentId)).rejects.toThrow()
        await publishAssignment(userId, 'TEACHER', assignmentId)
        let session = await createSession(userId, assignmentId)
        if (mode === 'legacy') {
          const { createCognitiveSessionConfigSnapshot } = await import(
            '../../modules/cognitive/session.service'
          )
          const configSnapshotEncrypted = createCognitiveSessionConfigSnapshot({
            testType: session.testType,
            configVersion: session.configVersion,
            engineVersion: session.engineVersion,
            scoringVersion: session.scoringVersion,
            config: session.config,
          })
          await prisma.cognitiveSession.update({
            where: { id: session.sessionId },
            data: {
              runtimeGeneration: null,
              compiledRuntimeHash: null,
              configSnapshotEncrypted,
            },
          })
          session = (await getSession(
            userId,
            session.sessionId,
          )) as typeof session
        }
        const { participantPresentations } = await import(
          './fixtures/onboarding/TEST_ONBOARDING_UNKNOWN_V1/participant-presentation'
        )
        const presentation = participantPresentations[0],
          original = presentation.metrics.correctCount.explanation
        presentation.metrics.correctCount.explanation =
          'Changed after assignment was frozen'
        try {
          expect(session.profile).toBe('standard')
          const final = {
            sessionId: session.sessionId,
            submissionId: randomUUID(),
            attemptEpoch: session.attemptEpoch,
            definitionHash: session.definitionHash!,
            contextSnapshotHash: session.contextSnapshotHash,
            trials: [true, false].map((correct, trialIndex) =>
              createTrialEnvelope({
                trialIndex,
                phase: 'learning',
                payload: { correct },
                startedAtPerfMs: trialIndex * 100,
                endedAtPerfMs: trialIndex * 100 + 50,
              }),
            ),
          }
          expect(
            (await submitCognitiveSessionFinal(userId, final)).replayed,
          ).toBe(false)
          expect(
            (await submitCognitiveSessionFinal(userId, final)).replayed,
          ).toBe(true)
          const result = await getSession(userId, session.sessionId)
          expect(result.status).toBe('COMPLETED')
          expect(JSON.stringify(result)).toContain('Unknown successes')
          expect(JSON.stringify(result)).toContain('Task-specific successes')
          expect(
            await prisma.cognitiveRawSubmission.count({
              where: { sessionId: session.sessionId },
            }),
          ).toBe(mode === 'UNIFIED_V1' ? 1 : 0)
          expect(JSON.stringify(result)).not.toContain(
            'Changed after assignment was frozen',
          )
        } finally {
          presentation.metrics.correctCount.explanation = original
        }
      },
    )
  },
)
