import { describe, expect, it, vi } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

import { prisma } from '../../config/database'
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
    trainingContentBindingHash: null,
    trainingReferenceBindingHash: null,
    trainingFeedbackSnapshotHash: null,
    trainingFlowSnapshotEncrypted: null,
    trainingFlowSnapshotHash: null,
    trainingFlowPathEncrypted: null,
    trainingFlowPathHash: null,
    trainingVariantAllocationEncrypted: null,
    trainingVariantAllocationHash: null,
    compositeAssessment: {
      productKind: 'QUESTIONNAIRE',
      creationKey: 'default:1.0.0',
      trainingFlowDraft: null,
      trainingFlowFrozen: null,
      trainingFlowDigest: null,
      trainingVariantDraft: null,
      trainingVariantFrozen: null,
      trainingVariantDigest: null,
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

  it('rejects before transaction when child compositeAttemptId does not match parent attempt ID', async () => {
    const scale = { id: 'scale-1', code: 's1', name: 'SampleScale', instrumentVersion: '1' }
    const validRuntime = createFrozenScaleRuntimeSnapshot({
      instrumentKey: 's1',
      instrumentVersion: '1',
      definition: sampleDefinition,
    })

    const mockChild: any = {
      id: 'child-1',
      compositeItemId: 'item-1',
      compositeAttemptId: 'other-parent-attempt-id',
      attemptEpoch: 1,
      scale,
    }

    const mockSlot: any = {
      slotKey: 'scale:item-1',
      unitType: 'SCALE',
      sourceDefinitionIdentity: { key: 's1', version: '1', hash: validRuntime.sourceDefinitionHash },
      sourceBinding: { compositeItemId: 'item-1', compiledRuntimeHash: validRuntime.compiledRuntime.compiledRuntimeHash },
    }

    await expect(batchEnsureScaleAdmissionsAtDelivery(dummyParent, [
      { slot: mockSlot, child: mockChild, runtime: validRuntime },
    ])).rejects.toThrow('子单元与上级测评身份不匹配')
  })

  it('rejects in transaction when current child compositeAttemptId does not match parent attempt ID', async () => {
    const scale = { id: 'scale-1', code: 's1', name: 'SampleScale', instrumentVersion: '1' }
    const validRuntime = createFrozenScaleRuntimeSnapshot({
      instrumentKey: 's1',
      instrumentVersion: '1',
      definition: sampleDefinition,
    })

    const mockChild: any = {
      id: 'child-1',
      compositeItemId: 'item-1',
      compositeAttemptId: 'parent-attempt-1',
      attemptEpoch: 1,
      deliveryMode: 'FINAL_ONLY',
      scale,
      frozenAdmissionSnapshotEncrypted: null,
      frozenAdmissionSnapshotHash: null,
    }

    const mockSlot: any = {
      slotKey: 'scale:item-1',
      unitType: 'SCALE',
      sourceDefinitionIdentity: { key: 's1', version: '1', hash: validRuntime.sourceDefinitionHash },
      sourceBinding: { compositeItemId: 'item-1', compiledRuntimeHash: validRuntime.compiledRuntime.compiledRuntimeHash },
    }

    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      assessment: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'child-1',
            compositeItemId: 'item-1',
            compositeAttemptId: 'hijacked-parent-id',
            attemptEpoch: 1,
            deliveryMode: 'FINAL_ONLY',
            scaleId: 'scale-1',
            scale,
            frozenAdmissionSnapshotEncrypted: null,
            frozenAdmissionSnapshotHash: null,
          },
        ]),
      },
    }

    vi.spyOn(prisma, '$transaction').mockImplementationOnce(async (callback: any) => callback(mockTx))

    await expect(batchEnsureScaleAdmissionsAtDelivery(dummyParent, [
      { slot: mockSlot, child: mockChild, runtime: validRuntime },
    ])).rejects.toThrow('测评轮次已改变')
  })

  it('rejects in transaction when current child compositeItemId does not match slot binding', async () => {
    const scale = { id: 'scale-1', code: 's1', name: 'SampleScale', instrumentVersion: '1' }
    const validRuntime = createFrozenScaleRuntimeSnapshot({
      instrumentKey: 's1',
      instrumentVersion: '1',
      definition: sampleDefinition,
    })

    const mockChild: any = {
      id: 'child-1',
      compositeItemId: 'item-1',
      compositeAttemptId: 'parent-attempt-1',
      attemptEpoch: 1,
      deliveryMode: 'FINAL_ONLY',
      scale,
      frozenAdmissionSnapshotEncrypted: null,
      frozenAdmissionSnapshotHash: null,
    }

    const mockSlot: any = {
      slotKey: 'scale:item-1',
      unitType: 'SCALE',
      sourceDefinitionIdentity: { key: 's1', version: '1', hash: validRuntime.sourceDefinitionHash },
      sourceBinding: { compositeItemId: 'item-1', compiledRuntimeHash: validRuntime.compiledRuntime.compiledRuntimeHash },
    }

    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      assessment: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'child-1',
            compositeItemId: 'item-mismatched-999',
            compositeAttemptId: 'parent-attempt-1',
            attemptEpoch: 1,
            deliveryMode: 'FINAL_ONLY',
            scaleId: 'scale-1',
            scale,
            frozenAdmissionSnapshotEncrypted: null,
            frozenAdmissionSnapshotHash: null,
          },
        ]),
      },
    }

    vi.spyOn(prisma, '$transaction').mockImplementationOnce(async (callback: any) => callback(mockTx))

    await expect(batchEnsureScaleAdmissionsAtDelivery(dummyParent, [
      { slot: mockSlot, child: mockChild, runtime: validRuntime },
    ])).rejects.toThrow('量表未绑定到当前测评单元')
  })

  it('rejects in transaction when current child compositeAttemptId is null (fail-closed)', async () => {
    const scale = { id: 'scale-1', code: 's1', name: 'SampleScale', instrumentVersion: '1' }
    const validRuntime = createFrozenScaleRuntimeSnapshot({
      instrumentKey: 's1',
      instrumentVersion: '1',
      definition: sampleDefinition,
    })

    const mockChild: any = {
      id: 'child-1',
      compositeItemId: 'item-1',
      compositeAttemptId: 'parent-attempt-1',
      attemptEpoch: 1,
      deliveryMode: 'FINAL_ONLY',
      scale,
      frozenAdmissionSnapshotEncrypted: null,
      frozenAdmissionSnapshotHash: null,
    }

    const mockSlot: any = {
      slotKey: 'scale:item-1',
      unitType: 'SCALE',
      sourceDefinitionIdentity: { key: 's1', version: '1', hash: validRuntime.sourceDefinitionHash },
      sourceBinding: { compositeItemId: 'item-1', compiledRuntimeHash: validRuntime.compiledRuntime.compiledRuntimeHash },
    }

    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      assessment: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'child-1',
            compositeItemId: 'item-1',
            compositeAttemptId: null, // Detached / null composite attempt ID
            attemptEpoch: 1,
            deliveryMode: 'FINAL_ONLY',
            scaleId: 'scale-1',
            scale,
            frozenAdmissionSnapshotEncrypted: null,
            frozenAdmissionSnapshotHash: null,
          },
        ]),
      },
    }

    vi.spyOn(prisma, '$transaction').mockImplementationOnce(async (callback: any) => callback(mockTx))

    await expect(batchEnsureScaleAdmissionsAtDelivery(dummyParent, [
      { slot: mockSlot, child: mockChild, runtime: validRuntime },
    ])).rejects.toThrow('测评轮次已改变')
  })

  it('rejects in transaction when current child scaleId does not match slot scale binding', async () => {
    const scale = { id: 'scale-1', code: 's1', name: 'SampleScale', instrumentVersion: '1' }
    const validRuntime = createFrozenScaleRuntimeSnapshot({
      instrumentKey: 's1',
      instrumentVersion: '1',
      definition: sampleDefinition,
    })

    const mockChild: any = {
      id: 'child-1',
      compositeItemId: 'item-1',
      compositeAttemptId: 'parent-attempt-1',
      attemptEpoch: 1,
      deliveryMode: 'FINAL_ONLY',
      scale,
      frozenAdmissionSnapshotEncrypted: null,
      frozenAdmissionSnapshotHash: null,
    }

    const mockSlot: any = {
      slotKey: 'scale:item-1',
      unitType: 'SCALE',
      sourceDefinitionIdentity: { key: 's1', version: '1', hash: validRuntime.sourceDefinitionHash },
      sourceBinding: { compositeItemId: 'item-1', scaleId: 'scale-1', compiledRuntimeHash: validRuntime.compiledRuntime.compiledRuntimeHash },
    }

    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      assessment: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'child-1',
            compositeItemId: 'item-1',
            compositeAttemptId: 'parent-attempt-1',
            attemptEpoch: 1,
            deliveryMode: 'FINAL_ONLY',
            scaleId: 'scale-different-2',
            scale,
            frozenAdmissionSnapshotEncrypted: null,
            frozenAdmissionSnapshotHash: null,
          },
        ]),
      },
    }

    vi.spyOn(prisma, '$transaction').mockImplementationOnce(async (callback: any) => callback(mockTx))

    await expect(batchEnsureScaleAdmissionsAtDelivery(dummyParent, [
      { slot: mockSlot, child: mockChild, runtime: validRuntime },
    ])).rejects.toThrow('量表未绑定到当前测评单元')
  })

  it('concurrency: if another concurrent request already persisted admission, transaction reuses the winner', async () => {
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

    const mockChild: any = {
      id: 'child-1',
      compositeItemId: 'item-1',
      compositeAttemptId: 'parent-attempt-1',
      attemptEpoch: 1,
      deliveryMode: 'FINAL_ONLY',
      scale,
      frozenAdmissionSnapshotEncrypted: null,
      frozenAdmissionSnapshotHash: null,
    }

    const mockSlot: any = {
      slotKey: 'scale:item-1',
      unitType: 'SCALE',
      sourceDefinitionIdentity: { key: 's1', version: '1', hash: validRuntime.sourceDefinitionHash },
      sourceBinding: { compositeItemId: 'item-1', compiledRuntimeHash: validRuntime.compiledRuntime.compiledRuntimeHash },
    }

    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      assessment: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'child-1',
            compositeItemId: 'item-1',
            compositeAttemptId: 'parent-attempt-1',
            attemptEpoch: 1,
            deliveryMode: 'FINAL_ONLY',
            scaleId: 'scale-1',
            scale,
            frozenAdmissionSnapshotEncrypted: encryptedAdmission,
            frozenAdmissionSnapshotHash: validAdmission.snapshotHash,
            runtimeSnapshotEncrypted: encryptUnifiedRuntimePayload(validRuntime),
            runtimeGeneration: 'UNIFIED_V1',
            userId: 'user-1',
            compiledRuntimeHash: validRuntime.compiledRuntime.compiledRuntimeHash,
          },
        ]),
      },
    }

    vi.spyOn(prisma, '$transaction').mockImplementationOnce(async (callback: any) => callback(mockTx))

    const result = await batchEnsureScaleAdmissionsAtDelivery(dummyParent, [
      { slot: mockSlot, child: mockChild, runtime: validRuntime },
    ])

    expect(result.size).toBe(1)
    expect(result.get('child-1')).toEqual(validAdmission)
  })
})

