import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { loadFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { compositeItemSlotKey } from '../../modules/assessment-runtime/slot-set'
import { submitScaleAssessmentFinal, type FinalScaleAnswerInput } from '../../modules/scale/scale-final-submit.service'
import { finalizeCompositeAttemptIfReady } from '../../modules/composite/composite.service'

/** Test-only real service chain. The caller must create and publish its execution
 * through the product fixture. This helper never inserts or repairs runtime,
 * admission, result, FINAL or execution-status records directly. */
export async function completeEducationLibraryScaleExecution(input: {
  db: PrismaClient
  actorUserId: string
  executionId: string
  answers: FinalScaleAnswerInput[]
}) {
  const started = await startAssessmentRunExecution({ executionId: input.executionId, actorUserId: input.actorUserId })
  if (started.state !== 'STARTED' || started.runtimeBindingKind !== 'COMPOSITE') {
    throw new Error('Expected a real library-scale COMPOSITE START')
  }
  const parent = await input.db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: started.runtimeBindingRef } })
  const children = await input.db.assessment.findMany({ where: { compositeAttemptId: parent.id, attemptEpoch: parent.attemptEpoch } })
  if (children.length !== 1) throw new Error('Expected one frozen library scale child')
  const child = children[0]
  if (!child.runtimeSnapshotEncrypted || !child.compositeItemId || child.userId !== input.actorUserId) {
    throw new Error('START did not bind the exact owned scale child')
  }
  const frozen = await loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted, input.db)
  const submissionId = randomUUID()
  await submitScaleAssessmentFinal({ assessmentId: child.id, submissionId,
    attemptEpoch: child.attemptEpoch, definitionHash: frozen.legacyDefinitionHash,
    contextSnapshotHash: parent.contextSnapshotHash, userId: input.actorUserId,
    compositeAttemptId: parent.id, answers: input.answers })
  await finalizeCompositeAttemptIfReady(parent.id)
  const completedParent = await input.db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: parent.id } })
  const completedChild = await input.db.assessment.findUniqueOrThrow({ where: { id: child.id } })
  const finals = await input.db.assessmentUnitSnapshot.findMany({ where: {
    compositeAttemptId: parent.id, attemptEpoch: child.attemptEpoch,
    slotKey: compositeItemSlotKey(child.compositeItemId, 'SCALE'),
    terminalState: 'COMPLETED', payloadKind: 'UNIT_RESULT', unitType: 'SCALE',
    sourceType: 'ASSESSMENT', sourceAttemptId: child.id, sourceSubmissionId: submissionId,
  } })
  if (completedParent.status !== 'COMPLETED' || completedChild.status !== 'COMPLETED'
    || finals.length !== 1 || !finals[0].canonicalResultEncrypted) {
    throw new Error('Real submission has not produced a completed parent and immutable FINAL')
  }
  return { started, parent: completedParent, child: completedChild, finalUnit: finals[0], submissionId, frozen }
}
