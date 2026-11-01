import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreReadingcompV1 } from '../../modules/cognitive/scoring/readingcomp.v1'
import type { ReadingcompConfig } from '../../modules/cognitive/schemas/readingcomp.config'
import type { ReadingcompTrial } from '../../modules/cognitive/schemas/readingcomp.trial'
import { READINGCOMP_BANK } from '../../modules/cognitive/tasks/readingcomp/bank.v1'

const config: ReadingcompConfig = {
  totalTrials: 4,
  stimulusSetVersion: 'readingcomp-zh-v1.0.0',
  fixationMs: 400,
  timeoutMs: 15000,
  validRtFloorMs: 300,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, itemId: string, responseIndex: number | null, rtMs: number | null = 500): { trialIndex: number; payload: ReadingcompTrial } => ({
  trialIndex: index,
  payload: { itemId, responseIndex, rtMs, interrupted: false },
})

describe('readingcomp scorer', () => {
  it('derives correctness from the frozen bank', () => {
    const items = READINGCOMP_BANK.slice(0, 4)
    const result = scoreReadingcompV1({
      config,
      trials: items.map((item, index) => trial(index, item.id, item.answer)),
    })
    expect(result.score).toBe(100)
    expect(result.metrics).toMatchObject({ accuracy: 1, errorCount: 0, timeoutCount: 0, validRtCount: 4 })
    expect(result.qualityFlags.interpretable).toBe(true)
  })

  it('flags low accuracy and insufficient valid RT for all-wrong submissions', () => {
    const items = READINGCOMP_BANK.slice(0, 4)
    const wrongIndex = (answer: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 => ((answer + 1) % 4) as 0 | 1 | 2 | 3
    const result = scoreReadingcompV1({
      config,
      trials: items.map((item, index) => trial(index, item.id, wrongIndex(item.answer))),
    })
    expect(result.metrics.accuracy).toBe(0)
    expect(result.metrics.validRtCount).toBe(0)
    expect(result.qualityFlags.lowAccuracy).toBe(true)
    expect(result.qualityFlags.insufficientValidRt).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
    expect(result.score).toBe(0)
  })

  it('rejects unknown items, duplicates, wrong counts and wrong stimulus set versions', () => {
    const items = READINGCOMP_BANK.slice(0, 4)
    expect(() => scoreReadingcompV1({
      config,
      trials: [trial(0, 'wa-999', 0), trial(1, 'wa-02', 0), trial(2, 'wa-03', 0), trial(3, 'wa-04', 0)],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreReadingcompV1({
      config,
      trials: [trial(0, items[0].id, 0), trial(1, items[0].id, 1), trial(2, items[1].id, 1), trial(3, items[2].id, 2)],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreReadingcompV1({ config, trials: [trial(0, items[0].id, 0)] })).toThrow(CognitiveScoringInputError)
    expect(() => scoreReadingcompV1({
      config: { ...config, stimulusSetVersion: 'readingcomp-zh-v9.9.9' },
      trials: items.map((item, index) => trial(index, item.id, item.answer)),
    })).toThrow(CognitiveScoringInputError)
  })
})
