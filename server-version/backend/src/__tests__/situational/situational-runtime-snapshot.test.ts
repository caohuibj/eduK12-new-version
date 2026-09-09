import { beforeEach, describe, expect, it } from 'vitest'
import {
  decryptFrozenSituationalRuntimeSnapshot,
  encryptFrozenSituationalRuntimeSnapshot,
  freezeSituationalRuntimeAtAttemptStart,
  parseFrozenSituationalRuntimeSnapshot,
} from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'

const frozenAt = new Date('2026-09-08T00:00:00.000Z')

describe('FrozenSituationalRuntimeSnapshotV1', () => {
  beforeEach(() => {
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  })

  it('freezes the authoritative definition, runner slice and compiled identity', () => {
    const snapshot = freezeSituationalRuntimeAtAttemptStart({
      instrumentKey: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key,
      instrumentVersion: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
      definition: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.definition,
      frozenAt,
    })
    expect(snapshot.definitionHash).toMatch(/^[0-9a-f]{64}$/)
    expect(snapshot.compiledRuntimeHash).toBe(snapshot.compiledRuntime.compiledRuntimeHash)
    expect(snapshot.scorerKey).toBe('situational.default')
    expect(snapshot.scoringVersion).toBe('sjt-provisional-v1')
    expect(snapshot.compiledRuntime.runtimeCapabilities).toEqual({
      standalone: true,
      embedded: true,
      aggregateEligible: true,
      collectionFacts: false,
      supported: true,
    })
    const runnerJson = JSON.stringify(snapshot.runnerDefinition)
    expect(runnerJson).not.toContain('choiceScores')
    expect(runnerJson).not.toContain('scoredConstruct')
    expect(runnerJson).not.toContain('situationFeatures')
    expect(parseFrozenSituationalRuntimeSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
  })

  it('round-trips only through the strict unified encrypted envelope', () => {
    const snapshot = freezeSituationalRuntimeAtAttemptStart({
      instrumentKey: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key,
      instrumentVersion: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
      definition: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.definition,
      frozenAt,
    })
    const encrypted = encryptFrozenSituationalRuntimeSnapshot(snapshot)
    expect(encrypted.split(':')).toHaveLength(3)
    expect(decryptFrozenSituationalRuntimeSnapshot(encrypted)).toEqual(snapshot)
  })

  it('rejects definition, runtime and snapshot tampering', () => {
    const snapshot = freezeSituationalRuntimeAtAttemptStart({
      instrumentKey: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key,
      instrumentVersion: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
      definition: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.definition,
      frozenAt,
    })
    const changedDefinition = JSON.parse(JSON.stringify(snapshot))
    changedDefinition.definition.scenes[0].title = 'tampered'
    expect(() => parseFrozenSituationalRuntimeSnapshot(changedDefinition)).toThrow('definition hash mismatch')

    const changedRuntime = JSON.parse(JSON.stringify(snapshot))
    changedRuntime.compiledRuntime.scorerVersion = 'wrong-version'
    expect(() => parseFrozenSituationalRuntimeSnapshot(changedRuntime)).toThrow('compiled runtime hash mismatch')

    const changedHash = JSON.parse(JSON.stringify(snapshot))
    changedHash.snapshotHash = '0'.repeat(64)
    expect(() => parseFrozenSituationalRuntimeSnapshot(changedHash)).toThrow('snapshot hash mismatch')
  })
})
