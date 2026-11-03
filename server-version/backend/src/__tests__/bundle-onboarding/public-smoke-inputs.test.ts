import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSmoke } from '../../../scripts/bundle-content-check'
import { loadPackage } from '../../modules/assessment-bundle/onboarding/loader'
import { verifyPackageFixtures } from '../../modules/assessment-bundle/onboarding/fixtures'
import { cognitiveSeeds } from '../../modules/cognitive/generated/seeds'
import { requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { mergeProfileConfig } from '../../modules/cognitive/profile-freeze'
import { getCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { createSessionConfigSnapshot } from '../../modules/cognitive/v2/session-snapshot'
import { runAuthoritativeScorer } from '../../modules/cognitive/v2/authoritative-scorer'
import { getExecutableScalePackage } from '../../modules/scale/onboarding/executable-registry'
import { scoreScale } from '../../modules/scale/scale-scoring'

describe('public smoke inputs use exact native scorers (not database lifecycle evidence)', () => {
  it.each([
    ['child_cognitive_tasks_zh_cn', '0.1.0'],
    ['working_memory_everyday_adult_zh_cn', '0.1.0'],
    ['emotion_beliefs_strategies_adult_zh_cn', '0.2.0'],
  ])('%s@%s', (key, version) => {
    const pack = loadPackage(path.resolve(__dirname, '../../modules/assessment-bundle/packages', key, version))
    const smoke = readSmoke(key, version)
    const values: Record<string, any> = {}
    for (const slot of pack.manifest.definition.slots) {
      let metrics: Record<string, unknown>
      if (slot.unitType === 'FORM') metrics = smoke.context
      else if (slot.unitType === 'COGNITIVE') {
        const dependency = pack.manifest.cognitiveDependencies.find(d => d.slotKey === slot.slotKey)!
        const seed = cognitiveSeeds.find(s => s.testType === slot.instrumentKey && s.configVersion === dependency.configVersion)!
        const entry = requireCognitiveRegistryEntry(slot.instrumentKey, dependency.engineVersion, dependency.scoringVersion)
        const definition = getCognitiveV2TaskDefinition(slot.instrumentKey, dependency.engineVersion, dependency.scoringVersion)!
        const session = createSessionConfigSnapshot({ definition, configVersion: dependency.configVersion,
          config: mergeProfileConfig(entry, seed.config, dependency.profile) })
        const input = smoke.slots[slot.slotKey]
        if (input.type !== 'COGNITIVE') throw new Error('Expected cognitive smoke')
        const result = runAuthoritativeScorer({ definition, session, randomSeed: smoke.randomSeed, trials: input.trials as any })
        expect(result.quality.state).toBe('interpretable')
        metrics = result.metrics
      } else if (slot.unitType === 'SCALE') {
        const source = getExecutableScalePackage(slot.instrumentKey, slot.instrumentVersion)!
        const input = smoke.slots[slot.slotKey]
        if (input.type !== 'SCALE') throw new Error('Expected scale smoke')
        const result = scoreScale(source.definition, input.answers)
        expect(result.quality.status).toBe('interpretable')
        metrics = Object.fromEntries(result.scores.map(score => [score.key, score.value]))
      } else throw new Error('Unexpected smoke family')
      for (const mapping of pack.evidence.filter(e => e.slotKey === slot.slotKey)) {
        expect(metrics[mapping.selector]).not.toBeNull()
        expect(metrics[mapping.selector]).not.toBeUndefined()
        values[mapping.evidenceKey] = { state: 'present', value: metrics[mapping.selector] }
      }
    }
    // Exercise the existing rule/derivation engine with scored synthetic inputs.
    // The persisted FINAL/report assertions remain in content.postgres.integration.
    pack.fixtures.valid = { values, expectedKind: smoke.expectedKind, expectedRuleIds: smoke.expectedRuleIds } as typeof pack.fixtures.valid
    expect(() => verifyPackageFixtures(pack)).not.toThrow()
  })
})
