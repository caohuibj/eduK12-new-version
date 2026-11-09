import { describe, expect, it } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

import { batchEnsureScaleAdmissionsAtDelivery } from '../../modules/scale/scale-admission.service'
import { createFrozenUnitAdmission } from '../../modules/assessment-runtime/admission-snapshot'
import { createFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { compileResearchScale } from '../../modules/survey/builder.compiler'

describe('Scheme X Batch Scale Admission at Delivery (PR X-05C)', () => {
  const dummyParent: any = {
    id: 'parent-attempt-1',
    userId: 'user-1',
    recoveryTokenHash: 'rec-1',
    deliveryMode: 'FINAL_ONLY',
    attemptEpoch: 1,
    contextSnapshotEncrypted: null,
    contextSnapshotHash: null,
    frozenActiveSlotSetEncrypted: null,
    frozenActiveSlotSetHash: null,
    compositeAssessment: {
      productKind: 'QUESTIONNAIRE',
      formSections: [],
    },
  }

  const sampleDefinition = compileResearchScale('SampleScale', {
    schemaVersion: 1,
    respondentType: 'participant_self_report',
    aggregation: 'sum',
    responseOptions: [
      { optionKey: 'yes', label: 'Yes', score: 1 },
      { optionKey: 'no', label: 'No', score: 0 },
    ],
    dimensions: [{ dimensionKey: 'total', label: 'Total', direction: 'descriptive' }],
    items: [{ itemKey: 'one', prompt: 'Question 1', required: true, reverse: false, dimensionKeys: ['total'] }],
  })

  it('returns empty map immediately when children array is empty', async () => {
    const result = await batchEnsureScaleAdmissionsAtDelivery(dummyParent, [])
    expect(result.size).toBe(0)
  })

  it('fast path: validates in memory without database transaction when all children have stored admission', async () => {
    const scale = { id: 'scale-1', code: 's1', name: 'SampleScale', instrumentVersion: '1' }
    const validRuntime = createFrozenScaleRuntimeSnapshot({
      instrumentKey: 's1',
      instrumentVersion: '1',
      definition: sampleDefinition,
    })

    const validAdmission = createFrozenUnitAdmission({
      attemptEpoch: 1,
      scale,
      principal: { userId: 'user-1' },
      parent: {
        kind: 'composite',
        parentId: 'parent-attempt-1',
        slotKey: 'scale:item-1',
        sourceDefinitionHash: validRuntime.sourceDefinitionHash,
        compiledRuntimeHash: validRuntime.compiledRuntime.compiledRuntimeHash,
      },
      requiresContext: false,
    })

    const encryptedAdmission = encryptUnifiedRuntimePayload(validAdmission)
    const encryptedRuntime = encryptUnifiedRuntimePayload(validRuntime)

    const mockChild: any = {
      id: 'child-1',
      compositeItemId: 'item-1',
      compositeAttemptId: 'parent-attempt-1',
      questionnaireAssessmentId: null,
      attemptEpoch: 1,
      runtimeGeneration: 'UNIFIED_V1',
      deliveryMode: 'FINAL_ONLY',
      userId: 'user-1',
      frozenAdmissionSnapshotEncrypted: encryptedAdmission,
      frozenAdmissionSnapshotHash: validAdmission.snapshotHash,
      runtimeSnapshotEncrypted: encryptedRuntime,
      scale,
      compiledRuntimeHash: validRuntime.compiledRuntime.compiledRuntimeHash,
    }

    const mockSlot: any = {
      slotKey: 'scale:item-1',
      unitType: 'SCALE',
      sourceDefinitionIdentity: { key: 's1', version: '1', hash: validRuntime.sourceDefinitionHash },
      sourceBinding: { compiledRuntimeHash: validRuntime.compiledRuntime.compiledRuntimeHash },
    }

    const result = await batchEnsureScaleAdmissionsAtDelivery(dummyParent, [
      { slot: mockSlot, child: mockChild, runtime: validRuntime },
    ])

    expect(result.size).toBe(1)
    expect(result.get('child-1')).toEqual(validAdmission)
  })

  it('detects attemptEpoch mismatch between parent and stored child admission in fast path', async () => {
    const scale = { id: 'scale-1', code: 's1', name: 'SampleScale', instrumentVersion: '1' }
    const validRuntime = createFrozenScaleRuntimeSnapshot({
      instrumentKey: 's1',
      instrumentVersion: '1',
      definition: sampleDefinition,
    })

    const validAdmission = createFrozenUnitAdmission({
      attemptEpoch: 1,
      scale,
      principal: { userId: 'user-1' },
      parent: {
        kind: 'composite',
        parentId: 'parent-attempt-1',
        slotKey: 'scale:item-1',
        sourceDefinitionHash: validRuntime.sourceDefinitionHash,
        compiledRuntimeHash: validRuntime.compiledRuntime.compiledRuntimeHash,
      },
      requiresContext: false,
    })

    const encryptedAdmission = encryptUnifiedRuntimePayload(validAdmission)
    const encryptedRuntime = encryptUnifiedRuntimePayload(validRuntime)

    const mockChild: any = {
      id: 'child-1',
      compositeItemId: 'item-1',
      compositeAttemptId: 'parent-attempt-1',
      questionnaireAssessmentId: null,
      attemptEpoch: 2, // Changed attemptEpoch (mismatch with admission.attemptEpoch=1)
      runtimeGeneration: 'UNIFIED_V1',
      deliveryMode: 'FINAL_ONLY',
      userId: 'user-1',
      frozenAdmissionSnapshotEncrypted: encryptedAdmission,
      frozenAdmissionSnapshotHash: validAdmission.snapshotHash,
      runtimeSnapshotEncrypted: encryptedRuntime,
      scale,
      compiledRuntimeHash: validRuntime.compiledRuntime.compiledRuntimeHash,
    }

    const mockSlot: any = {
      slotKey: 'scale:item-1',
      unitType: 'SCALE',
      sourceDefinitionIdentity: { key: 's1', version: '1', hash: validRuntime.sourceDefinitionHash },
      sourceBinding: { compiledRuntimeHash: validRuntime.compiledRuntime.compiledRuntimeHash },
    }

    await expect(batchEnsureScaleAdmissionsAtDelivery(dummyParent, [
      { slot: mockSlot, child: mockChild, runtime: validRuntime },
    ])).rejects.toThrow('量表冻结准入身份或轮次不匹配')
  })
})
