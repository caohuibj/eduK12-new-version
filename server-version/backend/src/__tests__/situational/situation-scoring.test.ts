import { describe, expect, it } from 'vitest'
import {
  missingRequiredSituationalResponseKeys,
  scoreSituational,
  SituationalResponseValidationError,
  validateSituationalResponse,
  type SituationalResponse,
} from '../../modules/situational/situation-scoring'
import type { SituationDefinitionV1 } from '../../modules/situational/situation-definition'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import { SJT_ANXIETY_GOLDEN_ZH_CN_V1_DEFINITION } from '../../modules/situational/packages/sjt-anxiety-golden-zh-cn-v1'

const behavior = (sceneKey: string, optionKey: string): SituationalResponse => ({
  sceneKey,
  channelKey: 'BEHAVIOR_TENDENCY',
  responseValue: optionKey,
})

const captureIssues = (score: () => unknown): string[] => {
  try {
    score()
  } catch (error) {
    if (error instanceof SituationalResponseValidationError) return error.issues.map((issue) => issue.message)
    throw error
  }
  throw new Error('expected scoring to throw SituationalResponseValidationError')
}

describe('situational scoring', () => {
  it('aggregates choice contributions as a mean across scenes', () => {
    const result = scoreSituational(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION, [
      behavior('AS-01', 'A'),
      behavior('AS-02', 'D'),
    ])
    expect(result.quality.status).toBe('interpretable')
    expect(result.quality.flags).toEqual([])
    const metric = result.metrics.find((entry) => entry.key === 'bfi2.assertiveness.behavior')
    expect(metric?.value).toBe(0)
    expect(metric?.status).toBe('calculated')
    expect(metric?.range).toEqual({ min: -1.5, max: 1.5 })
    expect(metric?.expectedResponses).toEqual(['AS-01:BEHAVIOR_TENDENCY', 'AS-02:BEHAVIOR_TENDENCY'])
    expect(metric?.answeredResponses).toEqual(['AS-01:BEHAVIOR_TENDENCY', 'AS-02:BEHAVIOR_TENDENCY'])
  })

  it('projects a rating channel as its raw 0–100 value and a choice channel as its contribution', () => {
    const result = scoreSituational(SJT_ANXIETY_GOLDEN_ZH_CN_V1_DEFINITION, [
      { sceneKey: 'AN-01', channelKey: 'APPRAISAL', responseValue: 'C' },
      { sceneKey: 'AN-01', channelKey: 'EMOTION_RATING', responseValue: 72 },
    ])
    const appraisal = result.metrics.find((entry) => entry.key === 'bfi2.anxiety.appraisal')
    const emotion = result.metrics.find((entry) => entry.key === 'bfi2.anxiety.emotion')
    expect(appraisal?.value).toBe(0.5)
    expect(appraisal?.range).toEqual({ min: -1, max: 1.5 })
    expect(emotion?.value).toBe(72)
    expect(emotion?.range).toEqual({ min: 0, max: 100 })
    expect(result.quality.status).toBe('interpretable')
  })

  it('marks metrics not_calculable and quality invalid when an expected response is missing', () => {
    const result = scoreSituational(SJT_ANXIETY_GOLDEN_ZH_CN_V1_DEFINITION, [
      { sceneKey: 'AN-01', channelKey: 'APPRAISAL', responseValue: 'C' },
    ])
    const emotion = result.metrics.find((entry) => entry.key === 'bfi2.anxiety.emotion')
    expect(emotion?.value).toBeNull()
    expect(emotion?.status).toBe('not_calculable')
    expect(emotion?.answeredResponses).toEqual([])
    expect(result.quality.status).toBe('invalid')
    expect(result.quality.flags).toEqual(['missing_responses', 'metric_not_calculable'])
  })

  it('rejects unknown scene-channel pairs, unknown options, duplicate answers and out-of-range ratings', () => {
    const unknownPair = () => scoreSituational(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION, [
      behavior('AS-99', 'A'),
    ])
    expect(unknownPair).toThrow(SituationalResponseValidationError)

    expect(() => scoreSituational(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION, [
      behavior('AS-01', 'Z'),
    ])).toThrow(SituationalResponseValidationError)
    expect(captureIssues(() => scoreSituational(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION, [
      behavior('AS-01', 'Z'),
    ])).join('|')).toContain('选择通道的回答必须是该通道的选项')

    expect(captureIssues(() => scoreSituational(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION, [
      behavior('AS-01', 'A'),
      behavior('AS-01', 'B'),
    ])).join('|')).toContain('同一场景通道重复回答')

    expect(captureIssues(() => scoreSituational(SJT_ANXIETY_GOLDEN_ZH_CN_V1_DEFINITION, [
      { sceneKey: 'AN-01', channelKey: 'EMOTION_RATING', responseValue: 101 },
    ])).join('|')).toContain('评分通道的回答必须是 0–100 的数字')

    let pairError: SituationalResponseValidationError | undefined
    try {
      unknownPair()
    } catch (error) {
      if (error instanceof SituationalResponseValidationError) pairError = error
    }
    expect(pairError).toBeInstanceOf(SituationalResponseValidationError)
    expect(pairError?.issues[0]?.path).toBe('responses.0')
    expect(pairError?.issues[0]?.message).toContain('回答引用了不存在的场景通道：AS-99:BEHAVIOR_TENDENCY')
  })

  it('accepts record-form responses keyed by sceneKey:channelKey', () => {
    const result = scoreSituational(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION, {
      'AS-01:BEHAVIOR_TENDENCY': 'A',
      'AS-02:BEHAVIOR_TENDENCY': 'B',
    })
    const metric = result.metrics.find((entry) => entry.key === 'bfi2.assertiveness.behavior')
    expect(metric?.value).toBe(1)
  })

  it('re-scores the same immutable responses under a new scoringVersion without schema change', () => {
    const calibrated: SituationDefinitionV1 = JSON.parse(JSON.stringify(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION))
    calibrated.scoring.scoringVersion = 'sjt-calibrated-v2'
    calibrated.scoring.choiceScores.forEach((entry) => {
      entry.contribution = entry.contribution * 0.8
    })

    const responses = [behavior('AS-01', 'A'), behavior('AS-02', 'C')]
    const responsesSnapshot = JSON.parse(JSON.stringify(responses))
    const provisional = scoreSituational(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION, responses)
    const calibratedResult = scoreSituational(calibrated, responses)

    expect(provisional.metrics[0]?.value).toBe(0.5)
    expect(calibratedResult.metrics[0]?.value).toBeCloseTo(0.4, 10)
    expect(JSON.parse(JSON.stringify(responses))).toEqual(responsesSnapshot)
    expect(responsesSnapshot[0]).not.toHaveProperty('score')
    expect(provisional.metrics[0]?.status).toBe('calculated')
    expect(calibratedResult.metrics[0]?.status).toBe('calculated')
  })
})

describe('situational response helpers', () => {
  it('validates a single response before persistence', () => {
    expect(() => validateSituationalResponse(SJT_ANXIETY_GOLDEN_ZH_CN_V1_DEFINITION, {
      sceneKey: 'AN-01',
      channelKey: 'EMOTION_RATING',
      responseValue: 55,
    })).not.toThrow()
    expect(() => validateSituationalResponse(SJT_ANXIETY_GOLDEN_ZH_CN_V1_DEFINITION, {
      sceneKey: 'AN-01',
      channelKey: 'APPRAISAL',
      responseValue: 'E',
    })).toThrow(SituationalResponseValidationError)
  })

  it('lists missing required scene-channel pairs', () => {
    expect(missingRequiredSituationalResponseKeys(SJT_ANXIETY_GOLDEN_ZH_CN_V1_DEFINITION, [])).toEqual([
      'AN-01:APPRAISAL',
      'AN-01:EMOTION_RATING',
    ])
    expect(missingRequiredSituationalResponseKeys(SJT_ANXIETY_GOLDEN_ZH_CN_V1_DEFINITION, [
      { sceneKey: 'AN-01', channelKey: 'APPRAISAL' },
    ])).toEqual(['AN-01:EMOTION_RATING'])
  })
})
