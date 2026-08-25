import { describe, expect, it } from 'vitest'
import { listCognitiveTestsCatalog } from '../../modules/cognitive/catalog.service'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { mergeProfileConfig } from '../../modules/cognitive/profile-freeze'
import { buildCognitiveSingleTaskReport } from '../../modules/cognitive/single-task-report'
import { buildCognitiveResearchPackage } from '../../modules/cognitive/export.service'
import { trailmakingConfigSchema } from '../../modules/cognitive/schemas/trailmaking.config'
import { trailmakingTrialSchema } from '../../modules/cognitive/schemas/trailmaking.trial'
import { reversallearningConfigSchema } from '../../modules/cognitive/schemas/reversallearning.config'
import { reversallearningTrialSchema } from '../../modules/cognitive/schemas/reversallearning.trial'
import { bartConfigSchema } from '../../modules/cognitive/schemas/bart.config'
import { bartTrialSchema } from '../../modules/cognitive/schemas/bart.trial'
import { scoreTrailmakingV1 } from '../../modules/cognitive/scoring/trailmaking.v1'
import { scoreReversallearningV1 } from '../../modules/cognitive/scoring/reversallearning.v1'
import { scoreBartV1 } from '../../modules/cognitive/scoring/bart.v1'
import { bartSequence, reversallearningSequence, trailmakingSequence } from '../../modules/cognitive/randomization'
import { listAnalysisProtocolDefinitions, listReportPackageDefinitions } from '../../modules/cognitive-analysis'
import { projectCompositeUnitReports } from '../../modules/composite/composite-report.projector'

const REPORT = { reportVersion: '1.0.0', referenceMode: 'none' as const }

const trailConfig = trailmakingConfigSchema.parse({
  form: 'AB',
  partAItemCount: 8,
  partBItemCount: 8,
  stepTimeoutMs: 15000,
  stimulusSetVersion: 'trailmaking-generated-v1.0.0',
  report: REPORT,
})

const reversalConfig = reversallearningConfigSchema.parse({
  totalTrials: 40,
  acquisitionTrials: 20,
  reversalTrials: 20,
  criterionConsecutiveCorrect: 6,
  rewardProbability: 0.8,
  trialTimeoutMs: 3000,
  stimulusSetVersion: 'reversal-symbols-v1.0.0',
  report: REPORT,
})

const bartConfig = bartConfigSchema.parse({
  balloonCount: 10,
  maxPumps: 6,
  trialTimeoutMs: 3000,
  pumpAnimationMs: 100,
  stimulusSetVersion: 'bart-generated-v1.0.0',
  report: REPORT,
})

describe('PR12 cognitive task contracts', () => {
  it('uses strict config and trial schemas without accepting client conditions or outcomes', () => {
    expect(trailmakingConfigSchema.safeParse({ ...trailConfig, extra: true }).success).toBe(false)
    expect(trailmakingTrialSchema.safeParse({
      attempts: [], deviceClass: 'desktop', interrupted: false, condition: 'A',
    }).success).toBe(false)
    expect(reversallearningConfigSchema.safeParse({ ...reversalConfig, extra: true }).success).toBe(false)
    expect(reversallearningTrialSchema.safeParse({ choice: 'left', rtMs: 300, interrupted: false, correct: true }).success).toBe(false)
    expect(bartConfigSchema.safeParse({ ...bartConfig, extra: true }).success).toBe(false)
    expect(bartTrialSchema.safeParse({ pumpCount: 2, completed: true, cashedOut: true, interrupted: false, exploded: false }).success).toBe(false)
    expect(bartTrialSchema.safeParse({ pumpCount: 0, completed: false, cashedOut: true, interrupted: false }).success).toBe(false)
  })

  it('merges all three profiles into schema-valid frozen configs', () => {
    const cases = [
      ['trailmaking', trailConfig, { experience: { form: 'A', partAItemCount: 12, partBItemCount: 0 }, standard: { partAItemCount: 12, partBItemCount: 12 }, research: { partAItemCount: 24, partBItemCount: 24 } }],
      ['reversallearning', reversalConfig, { experience: { totalTrials: 40, acquisitionTrials: 20, reversalTrials: 20 }, standard: { totalTrials: 120, acquisitionTrials: 60, reversalTrials: 60 }, research: { totalTrials: 240, acquisitionTrials: 120, reversalTrials: 120 } }],
      ['bart', bartConfig, { experience: { balloonCount: 10 }, standard: { balloonCount: 30 }, research: { balloonCount: 50 } }],
    ] as const

    for (const [testType, baseConfig, expected] of cases) {
      const entry = getCognitiveRegistryEntry(testType, '1.0.0', '1.0.0')
      expect(entry).toBeDefined()
      for (const profile of ['experience', 'standard', 'research'] as const) {
        const resolved = mergeProfileConfig(entry as never, baseConfig, profile) as Record<string, unknown>
        expect(resolved).toMatchObject(expected[profile])
        expect(entry?.configSchema.safeParse(resolved).success).toBe(true)
      }
    }
  })

  it('replays deterministic sequences and changes conditions for another seed', () => {
    expect(trailmakingSequence('pr12-seed-a', 'AB', 8, 8)).toEqual(trailmakingSequence('pr12-seed-a', 'AB', 8, 8))
    expect(trailmakingSequence('pr12-seed-a', 'AB', 8, 8)).not.toEqual(trailmakingSequence('pr12-seed-b', 'AB', 8, 8))
    expect(reversallearningSequence('pr12-seed-a', 40, 20, 20, 0.8)).toEqual(reversallearningSequence('pr12-seed-a', 40, 20, 20, 0.8))
    expect(reversallearningSequence('pr12-seed-a', 40, 20, 20, 0.8)).not.toEqual(reversallearningSequence('pr12-seed-b', 40, 20, 20, 0.8))
    expect(bartSequence('pr12-seed-a', 10, 6)).toEqual(bartSequence('pr12-seed-a', 10, 6))
    expect(bartSequence('pr12-seed-a', 10, 6)).not.toEqual(bartSequence('pr12-seed-b', 10, 6))
  })

  it('scores Trail Making from server-replayed targets and marks omissions without trusting conditions', () => {
    const seed = 'trailmaking-golden'
    const expected = trailmakingSequence(seed, trailConfig.form, trailConfig.partAItemCount, trailConfig.partBItemCount)
    const trials = expected.map((item, trialIndex) => ({
      trialIndex,
      payload: trailmakingTrialSchema.parse({
        attempts: [{ targetId: item.targetId, atMs: 100, pointerType: 'mouse' }],
        deviceClass: 'desktop',
        interrupted: false,
      }),
    }))
    const result = scoreTrailmakingV1({ config: trailConfig, trials, randomSeed: seed })
    expect(result.metrics).toMatchObject({ completionTimeMs: 1600, partACompletionTimeMs: 800, partBCompletionTimeMs: 800, completedStepCount: 16, errorCount: 0 })
    expect(result.qualityFlags.interpretable).toBe(true)

    const timedOut = scoreTrailmakingV1({
      config: trailConfig,
      trials: trials.map((trial, index) => index === 0 ? { ...trial, payload: trailmakingTrialSchema.parse({ attempts: [], deviceClass: 'desktop', interrupted: true }) } : trial),
      randomSeed: seed,
    })
    expect(timedOut.metrics.omissionRate).toBeGreaterThan(0)
    expect(timedOut.qualityFlags.timeLimitReached).toBe(true)
    expect(timedOut.qualityFlags.interpretable).toBe(false)

    const tampered = trials.map((trial, index) => index === 0 ? {
      ...trial,
      payload: trailmakingTrialSchema.parse({ attempts: [{ targetId: 'A-99', atMs: 100, pointerType: 'mouse' }], deviceClass: 'desktop', interrupted: false }),
    } : trial)
    expect(() => scoreTrailmakingV1({ config: trailConfig, trials: tampered, randomSeed: seed })).toThrow()
    expect(() => scoreTrailmakingV1({ config: trailConfig, trials: trials.slice(0, -1), randomSeed: seed })).toThrow()
  })

  it('scores Reversal Learning by frozen stage and exposes null criterion on insufficient responses', () => {
    const seed = 'reversallearning-golden'
    const expected = reversallearningSequence(seed, reversalConfig.totalTrials, reversalConfig.acquisitionTrials, reversalConfig.reversalTrials, reversalConfig.rewardProbability)
    const trials = expected.map((item, trialIndex) => ({
      trialIndex,
      payload: reversallearningTrialSchema.parse({ choice: item.correctResponse, rtMs: 400, interrupted: false }),
    }))
    const result = scoreReversallearningV1({ config: reversalConfig, trials, randomSeed: seed })
    expect(result.metrics).toMatchObject({ acquisitionAccuracy: 1, reversalAccuracy: 1, reversalCost: 0, trialsToAcquisitionCriterion: 6, trialsToReversalCriterion: 6, omissionRate: 0 })
    expect(result.qualityFlags.interpretable).toBe(true)

    const omissions = trials.map((trial) => ({ ...trial, payload: reversallearningTrialSchema.parse({ choice: null, rtMs: null, interrupted: false }) }))
    const omissionResult = scoreReversallearningV1({ config: reversalConfig, trials: omissions, randomSeed: seed })
    expect(omissionResult.metrics.trialsToAcquisitionCriterion).toBeNull()
    expect(omissionResult.metrics.trialsToReversalCriterion).toBeNull()
    expect(omissionResult.qualityFlags.excessiveOmissions).toBe(true)
    expect(omissionResult.qualityFlags.interpretable).toBe(false)

    const constant = trials.map((trial) => ({ ...trial, payload: reversallearningTrialSchema.parse({ choice: 'left', rtMs: 400, interrupted: false }) }))
    expect(scoreReversallearningV1({ config: reversalConfig, trials: constant, randomSeed: seed }).qualityFlags.constantChoice).toBe(true)
    expect(() => scoreReversallearningV1({ config: reversalConfig, trials: trials.slice(0, -1), randomSeed: seed })).toThrow()
  })

  it('scores BART only from pump/cashout state, rejects inconsistent outcomes, and hides product index', () => {
    const seed = 'bart-golden'
    const expected = bartSequence(seed, bartConfig.balloonCount, bartConfig.maxPumps)
    const trials = expected.map((item, trialIndex) => {
      const cashedOut = item.explosionThreshold > 1
      return {
        trialIndex,
        payload: bartTrialSchema.parse({
          pumpCount: cashedOut ? item.explosionThreshold - 1 : item.explosionThreshold,
          completed: true,
          cashedOut,
          interrupted: false,
        }),
      }
    })
    const result = scoreBartV1({ config: bartConfig, trials, randomSeed: seed })
    expect(result.score).toBe(0)
    expect(result.metrics.completedBalloonCount).toBe(10)
    expect(result.metrics.adjustedPumps).toBeTypeOf('number')
    expect(result.qualityFlags.invalidOutcome).toBe(false)

    const incomplete = trials.map((trial, index) => index === 0 ? { ...trial, payload: bartTrialSchema.parse({ pumpCount: 0, completed: false, cashedOut: false, interrupted: true }) } : trial)
    const incompleteResult = scoreBartV1({ config: bartConfig, trials: incomplete, randomSeed: seed })
    expect(incompleteResult.metrics.omissionRate).toBeGreaterThan(0)
    expect(incompleteResult.qualityFlags.interpretable).toBe(false)

    const inconsistent = trials.map((trial, index) => index === 0 ? {
      ...trial,
      payload: bartTrialSchema.parse({ pumpCount: expected[0].explosionThreshold, completed: true, cashedOut: true, interrupted: false }),
    } : trial)
    expect(() => scoreBartV1({ config: bartConfig, trials: inconsistent, randomSeed: seed })).toThrow()
    expect(() => scoreBartV1({ config: bartConfig, trials: trials.slice(0, -1), randomSeed: seed })).toThrow()

    const report = buildCognitiveSingleTaskReport({
      testType: 'bart', engineVersion: '1.0.0', scoringVersion: '1.0.0', configVersion: '1.0.0', profile: 'standard',
      frozenReport: null, score: result.score, metrics: result.metrics, qualityFlags: result.qualityFlags, reference: null,
    })
    expect(report?.showProductIndex).toBe(false)
    expect(report?.productIndex).toBeNull()
    expect(report?.disclaimer).toMatch(/不输出风险高低|风险偏好/)

    const projected = projectCompositeUnitReports([{
      type: 'COGNITIVE',
      itemId: 'bart-item',
      label: 'BART',
      testType: 'bart',
      singleTaskReport: report,
    }], 'participant')
    expect(projected[0].singleTaskReport.showProductIndex).toBe(false)
    expect(JSON.stringify(projected[0].singleTaskReport)).not.toContain('任务表现指数')

    const researchProjected = projectCompositeUnitReports([{
      type: 'COGNITIVE',
      itemId: 'bart-research-item',
      label: 'BART',
      testType: 'bart',
      singleTaskReport: { ...report, productIndex: { label: '任务表现指数', value: 99 } },
    }], 'researcher')
    expect(researchProjected[0].singleTaskReport.productIndex).toBeNull()

    const pack = buildCognitiveResearchPackage({
      id: 'bart-assignment',
      title: 'BART DRAFT',
      profile: 'standard',
      resolvedReportSnapshotEncrypted: null,
      config: { testType: 'bart' },
    } as never, [{
      id: 'bart-session', userId: null, anonymousCode: 'ANON-1', attemptNo: 1,
      testType: 'bart', configVersion: '1.0.0', engineVersion: '1.0.0', scoringVersion: '1.0.0',
      startedAt: new Date('2026-01-01T00:00:00Z'), finishedAt: new Date('2026-01-01T00:01:00Z'),
      score: 0, metrics: result.metrics, qualityFlags: result.qualityFlags, trials: [], user: null,
    }] as never, true)
    expect(pack.sessionRows[0]).not.toHaveProperty('A_score')
  })

  it('keeps PR12 tasks out of create recommendations and package/domain mappings', () => {
    for (const testType of ['trailmaking', 'reversallearning', 'bart']) {
      const entry = getCognitiveRegistryEntry(testType, '1.0.0', '1.0.0')
      expect(entry?.recommendedForCreate).toBe(false)
      expect(listCognitiveTestsCatalog(testType).list[0].recommendedForCreate).toBe(false)
    }
    const protocolText = JSON.stringify(listAnalysisProtocolDefinitions())
    const packageText = JSON.stringify(listReportPackageDefinitions())
    expect(protocolText).not.toContain('trailmaking')
    expect(protocolText).not.toContain('reversallearning')
    expect(protocolText).not.toContain('bart')
    expect(packageText).not.toContain('trailmaking')
    expect(packageText).not.toContain('reversallearning')
    expect(packageText).not.toContain('bart')
  })
})
