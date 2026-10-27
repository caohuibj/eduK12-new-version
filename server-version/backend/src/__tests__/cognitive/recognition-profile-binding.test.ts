import { describe, expect, it, vi } from 'vitest'
vi.mock('dotenv', () => ({ default: { config: () => ({ parsed: {} }) } }))
process.env.DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY ?? 'a'.repeat(64)
import { nativeConfig, type AssetManifestBinding } from '../../modules/cognitive/content-candidates/continuous-recognition/native'
import { getCognitiveTaskResource } from '../../modules/cognitive/task-resource'
import { freezeNativeAssignmentProfile, hashResolvedConfig, readFrozenReport } from '../../modules/cognitive/profile-freeze'

// Logical IDs and a synthetic binding only; no images are fetched or cleared by these fixtures.
const pool = Array.from({ length: 184 }, (_, i) => 'logical-' + i)
const practice = Array.from({ length: 6 }, (_, i) => 'practice-' + i)
const binding: AssetManifestBinding = { status: 'authorized', manifestHash: 'f'.repeat(64),
  evidenceRef: 'SYNTHETIC UNIT FIXTURE ONLY; NO REAL MATERIAL AUTHORIZATION' }
const resource = getCognitiveTaskResource('continuous-recognition', '0.1.0', '0.2.0')!
if (resource.kind !== 'native') throw Error('Native recognition resource missing')

describe('recognition profile freezes keep the base material identity', () => {
  it.each(['research', 'experience'] as const)('preserves the %s base material binding and exact config hash', profile => {
    const baseConfig = nativeConfig(profile, pool, practice, binding), before = JSON.stringify(baseConfig)
    const frozen = freezeNativeAssignmentProfile({ resource, baseConfig, profile })
    expect(frozen.resolvedConfig).toEqual(baseConfig)
    expect(frozen.resolvedConfigHash).toBe(hashResolvedConfig(baseConfig))
    expect(JSON.stringify(baseConfig)).toBe(before)
    expect(readFrozenReport(frozen.resolvedReportSnapshotEncrypted)?.profile).toBe(profile)
  })
  it.each(['pending', 'synthetic-review-only'] as const)('keeps %s material unapproved instead of creating authorization', status => {
    const rights: AssetManifestBinding = { status, manifestHash: null, evidenceRef: null }
    const baseConfig = nativeConfig('experience', pool, practice, rights)
    const frozen = freezeNativeAssignmentProfile({ resource, baseConfig, profile: 'experience' })
    expect(frozen.resolvedConfig).toEqual(baseConfig)
    expect((frozen.resolvedConfig as typeof baseConfig).assetManifestBinding).toEqual(rights)
  })
})
