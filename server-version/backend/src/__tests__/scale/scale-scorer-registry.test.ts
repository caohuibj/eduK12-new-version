import { afterEach, describe, expect, it } from 'vitest'
import {
  registerScaleCustomScorer,
  unregisterScaleCustomScorer,
  type ScaleCustomScorer,
} from '../../modules/scale/scale-scoring'

const TEST_KEY = 'pr1-duplicate-scorer-test'
const scorer: ScaleCustomScorer = () => ({ scores: [] })

describe('Scale custom scorer registry', () => {
  afterEach(() => unregisterScaleCustomScorer(TEST_KEY))

  it('rejects duplicate keys instead of silently overwriting the active scorer', () => {
    registerScaleCustomScorer(TEST_KEY, scorer)
    expect(() => registerScaleCustomScorer(TEST_KEY, () => ({ scores: [] })))
      .toThrow(/already registered/)
  })
})
