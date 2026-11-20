import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../../config/database'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { getAttemptState } from '../../modules/composite/composite.service'
import { submitCompositeScaleFinal } from '../../modules/scale/scale-final-submit.service'
import { loadFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { setupEducationLibraryRuntimeFixture } from './educationLibraryRuntimeFixture'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip

suite('Single-Scale School and Teacher transactions', () => {
  afterAll(async () => { await prisma.$disconnect() })

  it.each(['SCHOOL', 'TEACHER'] as const)('%s freezes once and commits one synchronous result under overlapping FINAL requests', async product => {
    requireIsolatedReleaseDatabase(url!)
    const fixture = await setupEducationLibraryRuntimeFixture({ db: prisma, product })
    const input = { executionId: fixture.executionId!, actorUserId: fixture.participantUserId }
    const started = await startAssessmentRunExecution(input)
    if (started.state !== 'STARTED' || started.runtimeBindingKind !== 'COMPOSITE') throw new Error('Expected an actual Scale START')
    const attemptId = started.runtimeBindingRef
    const child = await prisma.assessment.findFirstOrThrow({ where: { compositeAttemptId: attemptId } })
    expect(child.frozenAdmissionSnapshotHash).toMatch(/^[a-f0-9]{64}$/)
    const principal = { userId: input.actorUserId }
    const current = await getAttemptState(attemptId, principal, undefined, 'current-unit')
    expect(current.currentItem).toMatchObject({ scaleAssessmentId: child.id })
    expect(await startAssessmentRunExecution(input)).toMatchObject({ runtimeBindingRef: attemptId, replayed: true })
    const runtime = await loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted!)
    const body = {
      submissionId: randomUUID(), attemptEpoch: child.attemptEpoch, definitionHash: runtime.legacyDefinitionHash,
      contextSnapshotHash: current.contextSnapshotHash, answers: fixture.answers,
    }
    const submit = () => submitCompositeScaleFinal(attemptId, child.compositeItemId!, body, principal, { receiptOnly: true })
    const concurrent = await Promise.allSettled([submit(), submit()])
    expect(concurrent.some(result => result.status === 'fulfilled')).toBe(true)
    expect(await submit()).toMatchObject({ submissionId: body.submissionId, replayed: true, completed: true })
    const parent = await prisma.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: attemptId } })
    const assignment = await prisma.relationalAssessmentAssignment.findUniqueOrThrow({ where: { id: parent.assignmentRef! } })
    const [execution] = await prisma.$queryRaw<Array<{ status: string; completedAt: Date }>>`
      SELECT status, completed_at AS "completedAt" FROM assessment_run_executions WHERE id=${input.executionId}`
    expect(parent.status).toBe('COMPLETED')
    expect(parent.aggregateInputHash).toMatch(/^[a-f0-9]{64}$/)
    expect(assignment).toMatchObject({ status: 'COMPLETED', completedAt: parent.completedAt })
    expect(execution).toEqual({ status: 'COMPLETED', completedAt: parent.completedAt })
    expect(await prisma.assessmentUnitSnapshot.count({ where: { compositeAttemptId: attemptId } })).toBe(1)
  }, 30_000)
})
