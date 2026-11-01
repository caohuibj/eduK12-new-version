import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { getCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { cognitiveSeeds } from '../../modules/cognitive/generated/seeds'
import { resolveParticipantPresentation } from '../../modules/cognitive/participant-presentation'
import { freezeAssignmentProfile, readFrozenReport } from '../../modules/cognitive/profile-freeze'
import { evaluateCognitiveProductReadiness } from '../../modules/cognitive/library/product-readiness'
import { resolveCognitiveFinalMaxTrials } from '../../modules/cognitive/v2/final-submission-budget'
import { createSessionConfigSnapshot } from '../../modules/cognitive/v2/session-snapshot'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
import { runAuthoritativeScorer } from '../../modules/cognitive/v2/authoritative-scorer'
import { projectThreeLayerReport } from '../../modules/cognitive/v2/report'
import { buildCognitiveSingleTaskReport } from '../../modules/cognitive/single-task-report'
import { resolveRunner } from '../../../../frontend/src/modules/cognitive/registry'

const current = [
  { testType: 'icarmatrix', engineVersion: '2.1.0', scoringVersion: '1.1.0', counts: [4, 7] },
  { testType: 'lineangle', engineVersion: '2.0.0', scoringVersion: '2.0.0', counts: [12, 60] },
  { testType: 'sharegame', engineVersion: '2.0.0', scoringVersion: '2.0.0', counts: [3, 8] },
  { testType: 'embeddedfigures', engineVersion: '1.1.0', scoringVersion: '1.1.0', counts: [6, 16] },
]
type FixtureCase = { input: { config: unknown; trials: { trialIndex: number; payload: unknown }[]; randomSeed?: string }; expected?: { metrics: Record<string, unknown>; qualityFlags: Record<string, unknown> } }
const fixture = (id: typeof current[number]): { cases: FixtureCase[] } => JSON.parse(readFileSync(join(__dirname,
  `../../modules/cognitive/tasks/${id.testType}/fixtures/${id.engineVersion}-${id.scoringVersion}.json`), 'utf8'))
const project = (id: typeof current[number], sample: FixtureCase) => {
  const task = getCognitiveV2TaskDefinition(id.testType, id.engineVersion, id.scoringVersion)!
  const session = createSessionConfigSnapshot({ definition: task, configVersion: 'synthetic-integration', config: sample.input.config })
  const trials = sample.input.trials.map(trial => createTrialEnvelope({
    ...trial, phase: 'test', startedAtPerfMs: trial.trialIndex * 40000, endedAtPerfMs: trial.trialIndex * 40000 + 30000,
  }))
  const score = runAuthoritativeScorer({ definition: task, session, trials, randomSeed: sample.input.randomSeed ?? 'synthetic-integration' })
  const report = projectThreeLayerReport({ ...id, configVersion: 'synthetic-integration', protocolSignature: session.protocolSignature,
    profile: null, participantPresentation: resolveParticipantPresentation(id), definition: task.report,
    metrics: score.metrics, score, metricDefinitions: task.metrics, qualityDefinitions: task.quality,
  })
  return { score, report }
}
beforeAll(() => { vi.stubEnv('DATA_ENCRYPTION_KEY', 'f'.repeat(64)); vi.stubEnv('DATA_PSEUDONYM_KEY', 'e'.repeat(64)) })
afterAll(() => { vi.unstubAllEnvs() })

describe('four-task generated registration and frozen report integration', () => {
  it('resolves exact current/legacy identities on both sides and never falls back for unknown versions', () => {
    for (const id of current) {
      const entry = getCognitiveRegistryEntry(id.testType, id.engineVersion, id.scoringVersion)!
      expect(entry.recommendedForCreate, id.testType).toBe(true)
      expect(resolveRunner(id.testType, id.engineVersion)?.scoringVersion).toBe(id.scoringVersion)
      expect(resolveRunner(id.testType, id.engineVersion)?.reportDefinition.showProductIndex).toBe(false)
      expect(getCognitiveRegistryEntry(id.testType, '1.0.0', '1.0.0')?.recommendedForCreate).toBe(false)
      expect(resolveRunner(id.testType, '1.0.0')).toBeTruthy()
      expect(resolveRunner(id.testType, '999.0.0')).toBeUndefined()
      expect(getCognitiveRegistryEntry(id.testType, '999.0.0', id.scoringVersion)).toBeUndefined()
      expect(cognitiveSeeds.filter(seed => seed.testType === id.testType && seed.engineVersion === id.engineVersion && seed.scoringVersion === id.scoringVersion)).toHaveLength(1)
    }
    expect(getCognitiveRegistryEntry('icarmatrix', '2.0.0', '1.0.0')?.recommendedForCreate).toBe(false)
  })

  it('freezes actual profile counts, FINAL budgets and exact participant presentation through central bindings', () => {
    for (const id of current) {
      const entry = getCognitiveRegistryEntry(id.testType, id.engineVersion, id.scoringVersion)!
      const task = getCognitiveV2TaskDefinition(id.testType, id.engineVersion, id.scoringVersion)!
      const seed = cognitiveSeeds.find(seed => seed.testType === id.testType && seed.engineVersion === id.engineVersion)!
      expect(evaluateCognitiveProductReadiness(task, seed.config).blockers, id.testType).toEqual([])
      for (const [index, profile] of (['experience', 'research'] as const).entries()) {
        const frozen = freezeAssignmentProfile({ entry, baseConfig: seed.config, profile })
        const config = frozen.resolvedConfig as { totalTrials?: number; endowments?: number[]; report: { referenceMode: string } }
        expect(config.totalTrials ?? config.endowments?.length).toBe(id.counts[index])
        expect(config.report.referenceMode).toBe('none')
        expect(resolveCognitiveFinalMaxTrials(task, frozen.resolvedConfig)).toBe(id.counts[index])
        const report = readFrozenReport(frozen.resolvedReportSnapshotEncrypted)!
        expect(report.participantPresentation?.engineVersion).toBe(id.engineVersion)
        expect(report.participantPresentation?.scoringVersion).toBe(id.scoringVersion)
        expect(report.reportDefinition.showProductIndex).toBe(false)
        if (id.testType === 'icarmatrix') {
          expect(report.participantPresentation?.title).toContain('项目矩阵推理试测版')
          expect(report.participantPresentation?.reportReading?.popular?.concept).not.toMatch(/2[×x]2/)
          expect(report.participantPresentation?.reportReading?.professional?.configFields.find(field => field.key === 'matrixType')?.label).toContain('本版仅3×3')
          expect(report.qualityDefinitions.rapidGuessing.label).toBe('低于用时下限的作答较多')
        }
      }
    }
  })

  it('carries observations through generated scorer/report bindings without exposing research-map values', () => {
    for (const id of current) {
      const sample = fixture(id).cases.find(sample => sample.expected && sample.input.trials.length)!
      const { score, report } = project(id, sample)
      expect(score.metrics, id.testType).toEqual(sample.expected!.metrics)
      expect(report.method.engineVersion).toBe(id.engineVersion)
      expect(report.method.scoringVersion).toBe(id.scoringVersion)
      expect([...report.headline, ...report.user, ...report.detail].some(metric => metric.key === 'accuracyByRuleTag')).toBe(false)
    }
  })

  it('keeps zero numeric and missing share preferences null while all-missing reports suppress preference performance', () => {
    const id = current.find(id => id.testType === 'sharegame')!
    const cases = fixture(id).cases
    const zero = cases.find(sample => sample.expected?.metrics.givingRate === 0)!
    const none = cases.find(sample => sample.expected?.metrics.givingRate === null)!
    expect(project(id, zero).score.metrics.givingRate).toBe(0)
    const { score, report } = project(id, none)
    expect(score.metrics.givingRate).toBeNull()
    expect(report.headline).toEqual([]); expect(report.user).toEqual([])
    expect(report.reading?.visuals).toEqual([])
    const preferenceKeys = ['givingRate', 'generousRate', 'equalSplitCount', 'givingRateSd', 'medianDecisionMs']
    expect(report.detail.some(metric => preferenceKeys.includes(metric.key))).toBe(false)
    expect(preferenceKeys.every(key => score.metrics[key] === null)).toBe(true)
    const single = buildCognitiveSingleTaskReport({ ...id, configVersion: 'synthetic-integration', profile: null, frozenReport: null,
      score: 0, metrics: score.metrics, qualityFlags: none.expected!.qualityFlags, reference: null })!
    expect(single.headline).toBeNull(); expect(single.primaryMetrics).toEqual([]); expect(single.productIndex).toBeNull()
    expect(JSON.parse(JSON.stringify(score.metrics)).givingRate).toBeNull()
  })
})
