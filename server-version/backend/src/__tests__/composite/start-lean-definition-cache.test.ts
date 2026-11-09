import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

import {
  createFrozenScaleRuntimeSnapshot,
  encryptFrozenScaleRuntimeSnapshot,
  decryptFrozenScaleRuntimeSnapshot,
  loadFrozenScaleRuntimeSnapshot,
  clearDecryptedScaleSnapshotCacheForTest,
} from '../../modules/assessment-runtime/runtime-snapshot'
import {
  clearScaleFreezeCacheForTest,
} from '../../modules/composite/composite.service'
import {
  clearWholeQuestionnaireStaticCacheForTest,
} from '../../modules/composite/whole-questionnaire.service'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'

const frozenAt = new Date('2026-09-21T00:00:00.000Z')

const createValidSnapshot = () => {
  const source = getScaleInstrumentSource('adexi_v1', '2.0.0')!
  return createFrozenScaleRuntimeSnapshot({
    instrumentKey: source.identity.instrumentKey,
    instrumentVersion: source.identity.instrumentVersion,
    definition: source.executable!.definition,
    frozenAt,
  })
}

describe('PR X-09: In-Memory Definition Cache & START Lean Transaction', () => {
  beforeEach(() => {
    clearDecryptedScaleSnapshotCacheForTest()
    clearScaleFreezeCacheForTest()
    clearWholeQuestionnaireStaticCacheForTest()
  })

  it('populates and hits in-memory decrypted scale snapshot cache on encrypt and decrypt', () => {
    const mockSnapshot = createValidSnapshot()
    const ciphertext = encryptFrozenScaleRuntimeSnapshot(mockSnapshot)
    expect(typeof ciphertext).toBe('string')
    expect(ciphertext.length).toBeGreaterThan(0)

    // Decrypt should hit memory cache immediately and return the exact instance
    const decrypted = decryptFrozenScaleRuntimeSnapshot(ciphertext)
    expect(decrypted).toBe(mockSnapshot)
  })

  it('caches loadFrozenScaleRuntimeSnapshot results across repeated calls', async () => {
    const mockSnapshot = createValidSnapshot()
    const ciphertext = encryptFrozenScaleRuntimeSnapshot(mockSnapshot)

    // First load uses cache
    const loaded1 = await loadFrozenScaleRuntimeSnapshot(ciphertext)
    expect(loaded1).toBe(mockSnapshot)

    // Clear cache, then load again (which populates cache via parse)
    clearDecryptedScaleSnapshotCacheForTest()
    const loaded2 = await loadFrozenScaleRuntimeSnapshot(ciphertext)
    expect(loaded2.instrumentKey).toBe('adexi_v1')

    // Third load hits cache
    const loaded3 = await loadFrozenScaleRuntimeSnapshot(ciphertext)
    expect(loaded3).toBe(loaded2)
  })

  it('provides safe test-cleanup hooks for static questionnaire and scale freeze caches', () => {
    expect(() => clearScaleFreezeCacheForTest()).not.toThrow()
    expect(() => clearWholeQuestionnaireStaticCacheForTest()).not.toThrow()
  })

  it('allows getAttemptState to consume preloadedAttempt to bypass findUnique and snapshot query', async () => {
    const { getAttemptState } = await import('../../modules/composite/composite.service')
    const mockAttempt = {
      id: 'fresh-attempt-id-1234',
      userId: 'test-user',
      attemptEpoch: 1,
      runtimeGeneration: 'UNIFIED_V1',
      deliveryMode: 'FINAL_ONLY',
      completedItems: 0,
      progress: 0,
      status: 'IN_PROGRESS',
      isFreshAttempt: true,
      trainingFlowSnapshotEncrypted: null,
      trainingFlowSnapshotHash: null,
      trainingFlowPathEncrypted: null,
      trainingFlowPathHash: null,
      trainingVariantAllocationEncrypted: null,
      trainingVariantAllocationHash: null,
      compositeAssessment: {
        id: 'test-composite',
        name: 'Test Composite',
        productKind: 'QUESTIONNAIRE',
        trainingFlowDraft: null,
        trainingFlowFrozen: null,
        trainingFlowDigest: null,
        trainingVariantDraft: null,
        trainingVariantFrozen: null,
        trainingVariantDigest: null,
        items: [],
        formSections: [],
      },
      precomputedSlotSet: {
        schemaVersion: 1,
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        snapshotHash: 'mock-hash',
        slots: [],
      },
    }
    // Should successfully return state directly from preloadedAttempt in memory
    const state = await getAttemptState('fresh-attempt-id-1234', { userId: 'test-user' }, undefined, 'full', mockAttempt)
    expect(state).toBeDefined()
    expect(state.id).toBe('fresh-attempt-id-1234')
    expect(state.status).toBe('IN_PROGRESS')
  })
})
