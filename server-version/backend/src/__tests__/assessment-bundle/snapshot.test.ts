import { describe, expect, it } from 'vitest'
import {
  buildFrozenAssessmentBundleSnapshot,
  decryptFrozenAssessmentBundleSnapshot,
  encryptFrozenAssessmentBundleSnapshot,
  hashFrozenAssessmentBundleSnapshot,
  parseFrozenAssessmentBundleSnapshot,
  validateFrozenAssessmentBundleSnapshot,
} from '../../modules/assessment-bundle/snapshot'
import { compileBundleRuntimeFromFrozenRead } from '../../modules/assessment-bundle/compile'
import { BundleContractError } from '../../modules/assessment-bundle/errors'
import { cognitiveSelfBundle, formSlotBundle } from './fixtures'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

const failCode = (run: () => unknown): string => {
  try {
    run()
    throw new Error('expected BundleContractError')
  } catch (error) {
    if (error instanceof BundleContractError) return error.code
    throw error
  }
}

describe('FrozenAssessmentBundleSnapshotV3', () => {
  it('builds, reads and keeps a stable hash', () => {
    const first = buildFrozenAssessmentBundleSnapshot(cognitiveSelfBundle())
    const second = buildFrozenAssessmentBundleSnapshot(cognitiveSelfBundle())
    expect(first.snapshotVersion).toBe(3)
    expect(first.snapshotFamily).toBe('ASSESSMENT_BUNDLE')
    expect(first.snapshotHash).toBe(second.snapshotHash)
    expect(first.snapshotHash).toBe(hashFrozenAssessmentBundleSnapshot(first))
    expect(first.rightsSnapshotHash).toBeNull()
    expect(first.contextDefinitionHash).toBeNull()
    expect(validateFrozenAssessmentBundleSnapshot(first, cognitiveSelfBundle()).bundleKey)
      .toBe('cognitive_response_inhibition_v1')
    const roundTrip = decryptFrozenAssessmentBundleSnapshot(encryptFrozenAssessmentBundleSnapshot(first))
    expect(roundTrip.snapshotHash).toBe(first.snapshotHash)
  })

  it('lets FORM slots into the frozen bindings', () => {
    const snapshot = buildFrozenAssessmentBundleSnapshot(formSlotBundle())
    expect(snapshot.slotBindings.map((slot) => slot.unitType)).toEqual(['FORM', 'COGNITIVE'])
  })

  it('rejects definition/hash tampering', () => {
    const snapshot = buildFrozenAssessmentBundleSnapshot(cognitiveSelfBundle())
    expect(failCode(() => validateFrozenAssessmentBundleSnapshot({
      ...snapshot,
      bundleKey: 'tampered_bundle_v1',
    }))).toBe('SNAPSHOT_TAMPERED')
    expect(failCode(() => validateFrozenAssessmentBundleSnapshot({
      ...snapshot,
      snapshotHash: 'c'.repeat(64),
    }))).toBe('SNAPSHOT_HASH_MISMATCH')
    expect(failCode(() => parseFrozenAssessmentBundleSnapshot({
      ...snapshot,
      bundleDefinitionHash: 'd'.repeat(64),
    }))).toBe('SNAPSHOT_TAMPERED')
  })

  it('rejects unsupported snapshot versions', () => {
    const snapshot = buildFrozenAssessmentBundleSnapshot(cognitiveSelfBundle())
    expect(failCode(() => parseFrozenAssessmentBundleSnapshot({
      ...snapshot,
      snapshotVersion: 4,
    }))).toBe('UNSUPPORTED_SNAPSHOT')
  })

  it('rejects report definition dual-authority and unknown v3 fields', () => {
    const snapshot = buildFrozenAssessmentBundleSnapshot(cognitiveSelfBundle())
    const mismatched = {
      ...snapshot,
      reportDefinitionKey: 'report-other-v1',
    }
    const hashed = {
      ...mismatched,
      snapshotHash: hashFrozenAssessmentBundleSnapshot(mismatched),
    }
    expect(failCode(() => parseFrozenAssessmentBundleSnapshot(hashed))).toBe('SNAPSHOT_TAMPERED')
    expect(failCode(() => parseFrozenAssessmentBundleSnapshot({
      ...snapshot,
      packageKey: 'attention_stability_v1',
    }))).toBe('UNSUPPORTED_SNAPSHOT')
  })

  it('compiles through the existing V3.2 bundle runtime', () => {
    const snapshot = buildFrozenAssessmentBundleSnapshot(cognitiveSelfBundle())
    const compiled = compileBundleRuntimeFromFrozenRead({
      family: 'ASSESSMENT_BUNDLE',
      snapshotVersion: 3,
      snapshot,
    })
    expect(compiled.instrumentType).toBe('BUNDLE')
    expect(compiled.instrumentKey).toBe('assessment-bundle:cognitive_response_inhibition_v1')
    expect(compiled.sourceDefinitionHash).toBe(snapshot.snapshotHash)
    expect(compiled.compiledRuntimeHash).toMatch(/^[0-9a-f]{64}$/)
  })
})
