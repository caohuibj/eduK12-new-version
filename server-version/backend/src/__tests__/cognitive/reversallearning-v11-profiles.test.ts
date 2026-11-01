import { describe, expect, it } from 'vitest'
import { executionEntries } from '../../modules/cognitive/tasks/reversallearning/package'
import { seeds } from '../../modules/cognitive/tasks/reversallearning/seeds'
import { reversallearningSequence } from '../../modules/cognitive/randomization'
import { participantPresentations } from '../../modules/cognitive/tasks/reversallearning/participant-presentation'

const old = executionEntries[0]
const current = executionEntries[1]
describe('versioned reversal research configuration', () => {
  it('preserves the old seed/profile/schema/score while freezing the new profile inputs separately', () => {
    expect(old.engineVersion).toBe('1.0.0')
    expect(seeds[0].configVersion).toBe('1.0.0')
    expect(seeds[0].config).not.toHaveProperty('practiceTrialCount')
    expect(old.profiles!.research.configPatch).toEqual({ totalTrials: 240, acquisitionTrials: 120, reversalTrials: 120 })
    expect(current.engineVersion).toBe('1.1.0')
    expect(current.scoringVersion).toBe(old.scoringVersion)
    expect(current.score).toBe(old.score)
    expect(current.executionSemantics!.legacyStatus).toBe('DRAFT')
    expect(current.executionSemantics!.protocol.key).toBe('reversallearning/1.1.0/1.0.0')
    const config = current.configSchema.parse({ ...seeds[1].config, ...current.profiles!.research.configPatch }) as Record<string, unknown>
    expect(config).toMatchObject({ totalTrials: 240, acquisitionTrials: 120, reversalTrials: 120, rewardProbability: 0.8, trialTimeoutMs: 2000, practiceTrialCount: 30, practiceAcquisitionOnly: true })
    expect(old.configSchema.safeParse(config).success).toBe(false)
    expect(current.configSchema.safeParse({ ...config, totalTrials: 239 }).success).toBe(false)
    expect(participantPresentations.map(p => [p.engineVersion, p.presentationVersion])).toEqual([['1.0.0', '1.3.0'], ['1.1.0', '1.3.1']])
  })

  it('keeps the same server-derived 80/0 feedback calculation in the new configuration', () => {
    const config = current.configSchema.parse({ ...seeds[1].config, ...current.profiles!.research.configPatch }) as any
    const randomSeed = 'synthetic-reversal-v11'
    const sequence = reversallearningSequence(randomSeed, config.totalTrials, config.acquisitionTrials, config.reversalTrials, config.rewardProbability)
    const trials = sequence.map((spec, trialIndex) => ({ trialIndex, payload: { choice: trialIndex % 2 ? (spec.correctResponse === 'left' ? 'right' : 'left') : spec.correctResponse, rtMs: 500, interrupted: false } }))
    const rewarded = trials.filter((t, i) => t.payload.choice === sequence[i].correctResponse && sequence[i].rewardRoll < 0.8).length
    const result = current.score({ config, trials, randomSeed })
    expect(result.metrics.feedbackWinRate).toBe(Number((rewarded / 240).toFixed(4)))
    expect(result.metrics.acquisitionAccuracy).toBe(0.5)
    expect(result.metrics.reversalAccuracy).toBe(0.5)
    const missing = current.score({ config, trials: trials.map(t => ({ ...t, payload: { choice: null, rtMs: null, interrupted: true } })), randomSeed })
    expect(missing.metrics.feedbackWinRate).toBeNull()
    expect(missing.metrics.trialsToAcquisitionCriterion).toBeNull()
  })
})
