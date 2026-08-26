import { beforeAll, describe, expect, it } from 'vitest'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { freezeAssignmentProfile, hashResolvedConfig, mergeProfileConfig, readFrozenReport } from '../../modules/cognitive/profile-freeze'
import { listCognitiveTestsCatalog, getCognitiveTestCatalog } from '../../modules/cognitive/catalog.service'

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
})

const reactionEntry = () => getCognitiveRegistryEntry('reaction', '1.0.0', '1.0.0')!

const reactionBase = {
  totalTrials: 20,
  foreperiodMinMs: 700,
  foreperiodMaxMs: 1500,
  timeoutMs: 2000,
  readyDurationMs: 1000,
  report: { reportVersion: '1.0.0', referenceMode: 'none' as const },
}

describe('profile merge / freeze', () => {
  it('keeps standard reaction at 20 trials and experience at 8', () => {
    const entry = reactionEntry()
    expect(mergeProfileConfig(entry, reactionBase, 'standard').totalTrials).toBe(20)
    expect(mergeProfileConfig(entry, reactionBase, 'experience').totalTrials).toBe(8)
    expect(mergeProfileConfig(entry, reactionBase, 'research').totalTrials).toBe(60)
  })

  it('hashes the same resolved config identically', () => {
    const entry = reactionEntry()
    const frozen = freezeAssignmentProfile({ entry, baseConfig: reactionBase, profile: 'experience' })
    expect(frozen.resolvedConfigHash).toBe(hashResolvedConfig(frozen.resolvedConfig))
    expect(frozen.resolvedConfig.totalTrials).toBe(8)
    expect(frozen.resolvedReportSnapshotEncrypted).toEqual(expect.any(String))
    expect(readFrozenReport(frozen.resolvedReportSnapshotEncrypted)?.randomizationAlgorithmVersion)
      .toBe('reaction-foreperiod-v1.0.0')
  })
})

describe('memory 1.1.0 profile patches', () => {
  it('starts experience/standard/research at length 3 without mutating 1.0.0', () => {
    const v11 = getCognitiveRegistryEntry('memory', '1.0.0', '1.1.0')!
    const base = {
      startLength: 3,
      maxLength: 9,
      trialsPerLevel: 2,
      digitDisplayMs: 800,
      digitIntervalMs: 200,
      readyDurationMs: 1000,
      inactivityGuardMs: 30000,
      report: { reportVersion: '1.1.0', referenceMode: 'none' as const },
    }
    expect(mergeProfileConfig(v11, base, 'experience')).toMatchObject({ startLength: 3, maxLength: 6 })
    expect(mergeProfileConfig(v11, base, 'standard')).toMatchObject({ startLength: 3, maxLength: 8 })
    expect(mergeProfileConfig(v11, base, 'research')).toMatchObject({ startLength: 3, maxLength: 9 })
    expect(getCognitiveRegistryEntry('memory', '1.0.0', '1.0.0')?.profiles.experience.configPatch).not.toMatchObject({ startLength: 3 })
  })
})

describe('cognitive tests catalog', () => {
  it('returns every registered version instead of a latest fallback', () => {
    const catalog = listCognitiveTestsCatalog()
    const types = catalog.list.map((row) => `${row.testType}/${row.engineVersion}/${row.scoringVersion}`)
    expect(types).toEqual(expect.arrayContaining([
      'fake/1.0.0/1.0.0',
      'reaction/1.0.0/1.0.0',
      'memory/1.0.0/1.0.0',
      'stroop/1.0.0/1.0.0',
    ]))
    expect(catalog.list.every((row) => row.profiles.length === 3)).toBe(true)
  })

  it('returns a precise version when engine and scoring are supplied', () => {
    const row = getCognitiveTestCatalog('reaction', '1.0.0', '1.0.0')
    expect('testType' in row && row.testType).toBe('reaction')
    expect('list' in row).toBe(false)
  })

  it('returns the version list when the detail query omits versions', () => {
    const row = getCognitiveTestCatalog('stroop')
    expect('list' in row && row.list).toHaveLength(2)
  })

  it('rejects a detail query that supplies only one version', () => {
    expect(() => getCognitiveTestCatalog('reaction', '1.0.0')).toThrow(/必须同时提供/)
  })
})
