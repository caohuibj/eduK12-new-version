import { describe, expect, it } from 'vitest'
import { seeds } from '../../modules/cognitive/tasks/cancellation/seeds'
import { cancellationConfigSchema } from '../../modules/cognitive/schemas/cancellation.config'
import { executionEntries } from '../../modules/cognitive/tasks/cancellation/package'
import { cancellationScan as backendScan } from '../../modules/cognitive/tasks/cancellation/generator'
import { cancellationScan as frontendScan } from '../../../../frontend/src/modules/cognitive/tasks/cancellation/generator'

describe('current cancellation draft config to actual generated trials and scorer', () => {
  it('scores the unchanged current draft via its exact registered scorer and both generator copies', () => {
    const seed = seeds[0]
    const config = cancellationConfigSchema.parse(seed.config)
    const randomSeed = 'synthetic-current-cancellation-config'
    const trials = Array.from({ length: config.totalTrials }, (_, trialIndex) => {
      const scan = frontendScan(randomSeed, trialIndex)
      expect(scan).toEqual(backendScan(randomSeed, trialIndex))
      return { trialIndex, payload: { scanIndex: trialIndex, selectedCells: scan.targetCells, responseDurationMs: config.durationMs, interrupted: false } }
    })
    const entry = executionEntries.find(e => e.engineVersion === seed.engineVersion && e.scoringVersion === seed.scoringVersion)!
    const result = entry.score({ config, trials, randomSeed })
    expect(result.metrics).toMatchObject({ hitRate: 1, falseAlarmRate: 0, hitCount: 32, missCount: 0, falseAlarmCount: 0 })
  })
})
