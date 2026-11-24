import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { encryptUnifiedRuntimePayload, decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { decodeTrainingFinalReceipt, prepareTrainingFinalReceipt } from '../../modules/composite/training-content-final'

const mocks = vi.hoisted(() => ({
  getContentRelease: vi.fn(),
  prefetchContentReleases: vi.fn(),
}))

vi.mock('../../modules/measurement-content/repository', () => ({
  getContentRelease: mocks.getContentRelease,
  prefetchContentReleases: mocks.prefetchContentReleases,
}))

describe('training-content-final TFR2 compact receipt', () => {
  const h = (ch: string) => ch.repeat(64)
  const compositeId = '00000000-0000-4000-8000-000000000100'
  const attemptId = '00000000-0000-4000-8000-000000000101'
  const ownerId = '00000000-0000-4000-8000-000000000102'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64))
    vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED', 'true')
  })
  afterEach(() => vi.unstubAllEnvs())

  function makeNineUnitParent() {
    const units = Array.from({ length: 9 }, (_, i) => {
      const itemId = `00000000-0000-4000-8000-00000000020${i}`
      const releaseId = `00000000-0000-4000-8000-00000000030${i}`
      const scaleId = `00000000-0000-4000-8000-00000000040${i}`
      return {
        itemId,
        family: 'SCALE' as const,
        source: { kind: 'SCALE' as const, id: scaleId, ownerId },
        measurement: { releaseId, contentHash: h(String(i + 1)), measurementHash: h(String(i + 1)) },
      }
    })
    const binding = {
      schemaVersion: 1 as const,
      attemptId,
      epoch: 1,
      compositeId,
      publicationHash: h('0'),
      units,
    }
    const bindingHash = canonicalHash(binding)
    return {
      parent: {
        id: attemptId,
        attemptEpoch: 1,
        compositeAssessmentId: compositeId,
        compositeAssessment: { id: compositeId, createdBy: ownerId },
        trainingContentBinding: binding,
        trainingContentBindingHash: bindingHash,
        trainingReferenceBinding: null,
        trainingReferenceBindingHash: null,
        contextSnapshotHash: null,
      },
      units,
    }
  }

  it('encodes 9-unit receipts as TFR2, decodes identically with canonical hash verification, and shrinks ciphertext', async () => {
    const { parent, units } = makeNineUnitParent()
    mocks.prefetchContentReleases.mockResolvedValue(undefined)
    mocks.getContentRelease.mockImplementation(async (_tx: unknown, id: string) => {
      const idx = units.findIndex(u => u.measurement.releaseId === id)
      return {
        releaseId: id,
        contentHash: units[idx].measurement.contentHash,
        layer: 'MEASUREMENT',
        family: 'SCALE',
        status: 'PUBLISHED',
        scope: { kind: 'PRIVATE', product: 'TRAINING', ownerId, resourceId: units[idx].source.id },
        content: {
          schemaVersion: 1,
          measurementHash: units[idx].measurement.measurementHash,
          metrics: [{ key: 'total', kind: 'TOTAL' }],
        },
      }
    })

    const aggregateInputHash = h('e')
    const verifiedPayloads = units.map((u, i) => ({
      header: { slotKey: `scale:${u.itemId}` },
      envelope: {
        resultHash: h(String(i + 1)),
        core: {
          unitType: 'SCALE',
          contextHash: null,
          quality: { status: 'interpretable', flags: [] },
          metrics: [{ key: 'total', value: 10 + i, quality: 'calculated' }],
        },
      } as any,
    }))

    const prepared = await prepareTrainingFinalReceipt({ $queryRaw: vi.fn() } as any, {
      parent: parent as any,
      aggregateInputHash,
      completedAt: '2026-11-23T00:00:00.000Z',
      verifiedPayloads,
    })
    expect(prepared).not.toBeNull()

    const rawStored = decryptUnifiedRuntimePayload<any>(prepared!.encrypted)
    expect(rawStored.k).toBe('TFR2')
    expect(rawStored.s).toHaveLength(9)
    expect(rawStored.u).toEqual(Array(9).fill(2))

    const decoded = decodeTrainingFinalReceipt({
      ...(parent as any),
      aggregateInputHash,
      trainingContentInterpretationEncrypted: prepared!.encrypted,
      trainingContentInterpretationHash: prepared!.hash,
    })
    expect(decoded).toEqual(prepared!.receipt)
    expect(canonicalHash(decoded)).toBe(prepared!.hash)

    // Backward compatibility: legacy full-JSON receipt still decodes identically
    const legacyCipher = encryptUnifiedRuntimePayload(prepared!.receipt)
    expect(decodeTrainingFinalReceipt({
      ...(parent as any),
      aggregateInputHash,
      trainingContentInterpretationEncrypted: legacyCipher,
      trainingContentInterpretationHash: prepared!.hash,
    })).toEqual(prepared!.receipt)

    // Concrete byte-size reduction vs full JSON receipt
    expect(Buffer.byteLength(prepared!.encrypted)).toBeLessThan(Buffer.byteLength(legacyCipher))

    // Tamper rejection: corrupted hash or wrong aggregateInputHash
    expect(() => decodeTrainingFinalReceipt({
      ...(parent as any),
      aggregateInputHash: h('f'),
      trainingContentInterpretationEncrypted: prepared!.encrypted,
      trainingContentInterpretationHash: prepared!.hash,
    })).toThrow()

    const badCompact = encryptUnifiedRuntimePayload({ ...rawStored, s: [...rawStored.s.slice(0, 8), 'not-32-bytes'] })
    expect(() => decodeTrainingFinalReceipt({
      ...(parent as any),
      aggregateInputHash,
      trainingContentInterpretationEncrypted: badCompact,
      trainingContentInterpretationHash: prepared!.hash,
    })).toThrow()
  })
})
