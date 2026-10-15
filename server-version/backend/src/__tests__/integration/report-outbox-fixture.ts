import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { scaleDefinitionFor } from './mini-scale-definition'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { createFrozenScaleRuntimeSnapshot, encryptFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { encryptFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import { freezeCompositeActiveSlotSet } from '../../modules/assessment-runtime/attempt-runtime'

export const createReportOutboxFixture = async (db: PrismaClient, units = 1) => {
  const suffix = randomUUID().slice(0, 8)
  const owner = await db.user.create({ data: { username: 'report-owner-' + suffix, passwordHash: 'synthetic-unused', role: 'TEACHER' } })
  const participant = await db.user.create({ data: { username: 'report-participant-' + suffix, passwordHash: 'synthetic-unused', role: 'STUDENT' } })
  const composite = await db.compositeAssessment.create({ data: {
    code: 'report-q-' + suffix, name: 'Synthetic report outbox fixture', productKind: 'QUESTIONNAIRE',
    questionnaireType: 'GENERAL', status: 'PUBLISHED', createdBy: owner.id,
  } })
  const unitsData = []
  for (let index = 0; index < units; index++) {
    const definition = scaleDefinitionFor(3, 'report-item-' + suffix + '-' + index)
    const scale = await db.scale.create({ data: {
      code: 'report-scale-' + suffix + '-' + index, name: 'Synthetic scale', creatorId: owner.id,
      visibility: 'PUBLIC', status: 'PUBLISHED', instrumentClass: 'CUSTOM_DESCRIPTIVE', instrumentVersion: '2.0.0',
      definition: definition as any, definitionHash: hashScaleDefinition(definition), itemCount: 3, dimensionCount: 1,
    } })
    const runtime = createFrozenScaleRuntimeSnapshot({ instrumentKey: scale.code, instrumentVersion: scale.instrumentVersion, definition })
    const item = await db.compositeAssessmentItem.create({ data: { compositeAssessmentId: composite.id, type: 'SCALE', position: index, required: true, scaleId: scale.id } })
    unitsData.push({ scale, runtime, item, definition })
  }
  const slots = freezeCompositeActiveSlotSet({ attemptEpoch: 1, scales: unitsData.map(unit => ({
    compositeItemId: unit.item.id, code: unit.scale.code, instrumentVersion: unit.scale.instrumentVersion,
    sourceDefinitionHash: unit.runtime.sourceDefinitionHash, compiledRuntimeHash: unit.runtime.compiledRuntime.compiledRuntimeHash,
  })), cognitive: [], formSections: [] })
  const parent = await db.compositeAssessmentAttempt.create({ data: {
    compositeAssessmentId: composite.id, userId: participant.id, participantKey: 'report-principal-' + suffix,
    deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
    frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slots), frozenActiveSlotSetHash: slots.snapshotHash,
  } })
  const inputs = []
  for (const unit of unitsData) {
    const child = await db.assessment.create({ data: {
      scaleId: unit.scale.id, userId: participant.id, compositeAttemptId: parent.id, compositeItemId: unit.item.id,
      deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
      runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(unit.runtime), compiledRuntimeHash: unit.runtime.compiledRuntime.compiledRuntimeHash,
    } })
    inputs.push({ assessmentId: child.id, submissionId: 'report-submit-' + randomUUID(), attemptEpoch: 1,
      definitionHash: hashScaleDefinition(unit.definition), contextSnapshotHash: null,
      compositeAttemptId: parent.id, userId: participant.id,
      answers: unit.definition.items.map(item => ({ itemCode: item.itemCode, responseValue: 'yes' })),
    })
  }
  return { parent, owner, participant, composite, inputs, scaleIds: unitsData.map(unit => unit.scale.id) }
}
