import { describe, expect, it } from 'vitest'
import { seeds } from '../../modules/cognitive/tasks/numberline/seeds'
import { executionEntries } from '../../modules/cognitive/tasks/numberline/package'
import { NUMBERLINE_NP_SETS, buildNumberlineNpTargets } from '../../modules/cognitive/tasks/numberline/np-generator'
import { buildNumberlineNpTargets as frontendTargets } from '../../../../frontend/src/modules/cognitive/tasks/numberline/prng.np'
import { numberlineNpConfigSchema } from '../../modules/cognitive/schemas/numberline.np.config'
import { scoreNumberlineNpV1 } from '../../modules/cognitive/scoring/numberline.np.v1'

const randomSeed = 'synthetic-numberline-np'
const config = numberlineNpConfigSchema.parse(seeds[1].config)
const trials = () => buildNumberlineNpTargets(randomSeed, config.lineMax, config.targetSet).map((t, trialIndex) => ({ trialIndex, payload: { targetNumber: t.targetNumber, responsePosition: t.targetNumber / config.lineMax, rtMs: 1000, interrupted: false } }))
describe('numberline NP numeric adaptation', () => {
  it('freezes eight separate range/set/deadline configs and scores exactly the six original numerical points', () => {
    expect(seeds[0]).toMatchObject({ configVersion: '1.0.1', engineVersion: '1.0.1', scoringVersion: '1.0.0' })
    expect(executionEntries[0].profiles!.research.configPatch).toEqual({ totalTrials: 40 })
    expect(seeds).toHaveLength(9)
    for (const seed of seeds.slice(1)) {
      const c = numberlineNpConfigSchema.parse(seed.config)
      const targets = buildNumberlineNpTargets(randomSeed, c.lineMax, c.targetSet)
      expect(targets).toEqual(frontendTargets(randomSeed, c.lineMax, c.targetSet))
      expect(targets.map(t => t.targetNumber).sort((a, b) => a - b)).toEqual([...NUMBERLINE_NP_SETS[c.lineMax][c.targetSet]].sort((a, b) => a - b))
      const result = scoreNumberlineNpV1({ config: c, randomSeed, trials: targets.map((t, trialIndex) => ({ trialIndex, payload: { targetNumber: t.targetNumber, responsePosition: t.targetNumber / c.lineMax, rtMs: 1000, interrupted: false } })) })
      expect(result.metrics).toMatchObject({ paePercent: 0, biasPercent: 0, validTrialCount: 6, timeoutCount: 0 })
      expect(executionEntries[1].finalSubmission!.maxTrials(c)).toBe(6)
      expect(executionEntries[1].profiles!.research.configPatch).toEqual({})
    }
  })
  it('rejects changed targets, late responses, missing trials and invalid protocol settings', () => {
    const wrong = trials(); wrong[0].payload.targetNumber++
    expect(() => scoreNumberlineNpV1({ config, randomSeed, trials: wrong })).toThrow(/target\/order/)
    const late = trials(); late[0].payload.rtMs = config.maxResponseMs + 1
    expect(() => scoreNumberlineNpV1({ config, randomSeed, trials: late })).toThrow(/response window/)
    expect(() => scoreNumberlineNpV1({ config, randomSeed, trials: trials().slice(1) })).toThrow(/six trials/)
    expect(numberlineNpConfigSchema.safeParse({ ...config, maxResponseMs: 10000 }).success).toBe(false)
  })
  it('keeps an actual endpoint zero distinct from an unanswered position', () => {
    const atZero = trials().map(t => ({ ...t, payload: { ...t.payload, responsePosition: 0 } }))
    const recorded = scoreNumberlineNpV1({ config, randomSeed, trials: atZero })
    expect(recorded.metrics.validTrialCount).toBe(6)
    expect(recorded.metrics.timeoutCount).toBe(0)
    expect(recorded.metrics.biasPercent).toBeLessThan(0)
    const missing = scoreNumberlineNpV1({ config, randomSeed, trials: atZero.map(t => ({ ...t, payload: { ...t.payload, responsePosition: null, rtMs: null } })) })
    expect(missing.metrics).toMatchObject({ paePercent: null, biasPercent: null, validTrialCount: 0, timeoutCount: 6 })
  })
})
