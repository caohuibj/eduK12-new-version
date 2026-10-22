import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { setupEducationLibraryRuntimeFixture } from './educationLibraryRuntimeFixture'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { loadFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { submitScaleAssessmentFinal } from '../../modules/scale/scale-final-submit.service'
import { stopCollection } from '../../modules/scale-library-governance/service'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
let db: PrismaClient

suite('Education library emergency collection stop at real runtime boundaries', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    process.env.DATA_ENCRYPTION_KEY ||= '55'.repeat(32)
    process.env.DATA_PSEUDONYM_KEY ||= '56'.repeat(32)
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY ||= '57'.repeat(32)
    db = new PrismaClient({ datasources: { db: { url: url! } } })
    await db.$connect()
  })
  afterAll(async () => { await db?.$disconnect() })

  for (const product of ['SCHOOL', 'TEACHER'] as const) {
    it(`${product}: committed release stop rejects a new START and an already-started FINAL without saving results`, async () => {
      const fixture = await setupEducationLibraryRuntimeFixture({ db, product, trackCount: 2 })
      const executions = await fixture.executions()
      expect(executions).toHaveLength(2)
      const actorUserId = fixture.participantUserId
      const started = await startAssessmentRunExecution({ executionId: executions[0].id, actorUserId })
      if (started.state !== 'STARTED' || started.runtimeBindingKind !== 'COMPOSITE') {
        throw new Error('Expected a genuine composite START before stopping collection')
      }
      const parent = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: started.runtimeBindingRef } })
      const children = await db.assessment.findMany({ where: { compositeAttemptId: parent.id, attemptEpoch: parent.attemptEpoch } })
      expect(children).toHaveLength(1)
      const child = children[0]
      expect(child.userId).toBe(actorUserId)
      expect(child.status).toBe('IN_PROGRESS')
      if (!child.runtimeSnapshotEncrypted) throw new Error('Real START must freeze its scale runtime')
      const frozen = await loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted, db)

      await db.$transaction(tx => stopCollection(tx, fixture.libraryAdminUserId,
        'RELEASE', fixture.release.releaseId, 'Synthetic exact education collection stop'))

      await expect(startAssessmentRunExecution({ executionId: executions[1].id, actorUserId }))
        .rejects.toThrow('紧急停用')
      const [unstarted] = await db.$queryRaw<Array<{ status: string; runtimeBindingRef: string | null }>>`
        SELECT status, runtime_binding_ref AS "runtimeBindingRef"
        FROM assessment_run_executions WHERE id=${executions[1].id}`
      expect(unstarted).toMatchObject({ status: 'ASSIGNED', runtimeBindingRef: null })

      await expect(submitScaleAssessmentFinal({ assessmentId: child.id, submissionId: randomUUID(),
        attemptEpoch: child.attemptEpoch, definitionHash: frozen.legacyDefinitionHash,
        contextSnapshotHash: parent.contextSnapshotHash, userId: actorUserId,
        compositeAttemptId: parent.id, answers: fixture.answers })).rejects.toThrow('紧急停用')
      const retained = await db.assessment.findUniqueOrThrow({ where: { id: child.id } })
      expect(retained.status).toBe('IN_PROGRESS')
      expect(retained.submissionId).toBeNull()
      expect(retained.answers).toEqual(child.answers)
      expect(retained.result).toEqual(child.result)
      expect(await db.assessmentUnitSnapshot.count({ where: {
        compositeAttemptId: parent.id, attemptEpoch: parent.attemptEpoch, terminalState: 'COMPLETED',
      } })).toBe(0)
      expect((await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: parent.id } })).status).not.toBe('COMPLETED')
    }, 30000)
  }
})
