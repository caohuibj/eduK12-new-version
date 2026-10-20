import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptCompactField } from '../../modules/assessment-runtime/compact-field-codec'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { decryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import {
  freezeAssignmentProfile, hashResolvedConfig, loadFrozenMeasurementContext, readFrozenReport,
} from '../../modules/cognitive/profile-freeze'
import { seeds } from '../../modules/cognitive/tasks/gonogo/seeds'

const entry = () => getCognitiveRegistryEntry('gonogo', '1.0.0', '1.0.0')!
const freeze = (profile: 'experience' | 'standard' | 'research' = 'standard') =>
  freezeAssignmentProfile({ entry: entry(), baseConfig: seeds[0].config, profile })

beforeEach(() => {
  vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64))
  vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED', 'false')
  vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED', 'false')
  vi.stubEnv('ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED', 'false')
})
afterEach(() => vi.unstubAllEnvs())

describe('new Cognitive frozen-report storage', () => {
  it.each([
    ['false', 'false', 'false', false],
    ['false', 'true', 'true', false],
    ['true', 'false', 'false', true],
    ['true', 'true', 'false', true],
    ['true', 'true', 'true', true],
  ] as const)('gates only new report encoding: compact=%s control=%s runtime=%s', (compact, control, runtime, enabled) => {
    vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED', compact)
    vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED', control)
    vi.stubEnv('ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED', runtime)
    const frozen = freeze()
    expect(frozen.resolvedReportSnapshotEncrypted.startsWith('ekc1:')).toBe(enabled)
    expect(frozen.resolvedConfigSnapshotEncrypted).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/)
  })

  it.each(['experience', 'standard', 'research'] as const)('preserves the complete %s definition and plaintext hashes', profile => {
    const legacy = freeze(profile)
    vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED', 'true')
    const compact = freeze(profile)
    const before = readFrozenReport(legacy.resolvedReportSnapshotEncrypted)!
    const after = readFrozenReport(compact.resolvedReportSnapshotEncrypted)!
    expect(after).toEqual(before)
    expect(hashResolvedConfig(after)).toBe(hashResolvedConfig(before))
    expect(after.participantPresentation).toBeDefined()
    expect(after.v2MetricDefinitions).toBeDefined()
    expect(after.v2QualityDefinitions).toBeDefined()
    expect(after.v2ReportDefinition).toBeDefined()
    expect(after.metricDefinitions).toEqual(entry().metricDefinitions)
    expect(after.qualityDefinitions).toEqual(entry().qualityDefinitions)
    expect(after.reportDefinition).toEqual(entry().reportDefinition)
    expect(compact.resolvedConfig).toEqual(legacy.resolvedConfig)
    expect(compact.resolvedConfigHash).toBe(legacy.resolvedConfigHash)
    expect(compact.profileDefinitionVersion).toBe(legacy.profileDefinitionVersion)
    expect(decryptCognitivePayload(compact.resolvedConfigSnapshotEncrypted)).toEqual(legacy.resolvedConfig)
    expect(decryptCognitivePayload(compact.resolvedReportSnapshotEncrypted)).toEqual(before)
  })

  it.each(['false', 'true'])('reads old and compact assignments with new writes=%s', async enabled => {
    const legacy = freeze()
    vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED', 'true')
    const compact = freeze()
    vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED', enabled)
    for (const frozen of [legacy, compact]) {
      const findUnique = vi.fn().mockResolvedValue(frozen)
      const context = await loadFrozenMeasurementContext({ cognitiveAssignment: { findUnique } }, 'assignment')
      expect(context).toEqual({
        profile: legacy.profile,
        resolvedConfigHash: legacy.resolvedConfigHash,
        frozenReport: readFrozenReport(legacy.resolvedReportSnapshotEncrypted),
      })
      expect(findUnique).toHaveBeenCalledTimes(1)
    }
  })

  it.each(['ciphertext', 'length', 'key', 'domain', 'version'] as const)('rejects an invalid %s envelope', change => {
    vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED', 'true')
    const cipher = freeze().resolvedReportSnapshotEncrypted
    let invalid = cipher
    if (change === 'ciphertext') {
      const parts = cipher.split(':')
      const bytes = Buffer.from(parts[5], 'base64')
      bytes[bytes.length - 1] ^= 1
      parts[5] = bytes.toString('base64')
      invalid = parts.join(':')
    } else if (change === 'length') {
      const parts = cipher.split(':')
      parts[3] = String(Number(parts[3]) + 1)
      invalid = parts.join(':')
    } else if (change === 'key') {
      vi.stubEnv('DATA_ENCRYPTION_KEY', 'b'.repeat(64))
    } else {
      const report = readFrozenReport(cipher)
      invalid = encryptCompactField(change === 'domain'
        ? { schemaVersion: 1, value: report }
        : { version: 2, value: report })
    }
    expect(() => readFrozenReport(invalid)).toThrow()
  })
})
