import { describe, expect, it } from 'vitest'
import { situationalFinalSubmitSchema } from '../../modules/situational/situational-final-submit.schema'
import { normalizeSituationalResponses } from '../../modules/situational/situational-final-submit.service'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import { SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-anxiety-golden-zh-cn-v1'

const validBody = {
  submissionId: 'submission-00000001',
  attemptEpoch: 1,
  definitionHash: 'a'.repeat(64),
  responses: [
    { sceneKey: 'AS-02', channelKey: 'behavior', responseValue: 'A' },
    { sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'B' },
  ],
}

describe('Situational FINAL request contract', () => {
  it('accepts raw response primitives and rejects client-derived scoring fields', () => {
    expect(situationalFinalSubmitSchema.safeParse(validBody).success).toBe(true)
    expect(situationalFinalSubmitSchema.safeParse({
      ...validBody,
      responses: [{ ...validBody.responses[0], score: 99 }],
    }).success).toBe(false)
    expect(situationalFinalSubmitSchema.safeParse({
      ...validBody,
      responses: [{ ...validBody.responses[0], band: 'high', percentile: 99 }],
    }).success).toBe(false)
  })

  it('normalizes exactly once into frozen scene order and rejects duplicates or omissions', () => {
    const normalized = normalizeSituationalResponses(
      SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.definition,
      validBody.responses,
    )
    expect(normalized.map((response) => response.sceneKey)).toEqual(['AS-01', 'AS-02'])
    expect(() => normalizeSituationalResponses(
      SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.definition,
      [...validBody.responses, validBody.responses[0]],
    )).toThrow('重复回答')
    expect(() => normalizeSituationalResponses(
      SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.definition,
      [validBody.responses[0]],
    )).toThrow('未作答')
  })

  it('keeps continuous responses as raw inclusive-range values', () => {
    const definition = SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE.definition
    expect(normalizeSituationalResponses(definition, [
      { sceneKey: 'AN-01', channelKey: 'appraisal', responseValue: 'A' },
      { sceneKey: 'AN-01', channelKey: 'emotion', responseValue: 0 },
    ])).toEqual([
      { sceneKey: 'AN-01', channelKey: 'appraisal', responseValue: 'A' },
      { sceneKey: 'AN-01', channelKey: 'emotion', responseValue: 0 },
    ])
    expect(normalizeSituationalResponses(definition, [
      { sceneKey: 'AN-01', channelKey: 'appraisal', responseValue: 'A' },
      { sceneKey: 'AN-01', channelKey: 'emotion', responseValue: 100 },
    ])).toHaveLength(2)
    expect(() => normalizeSituationalResponses(definition, [
      { sceneKey: 'AN-01', channelKey: 'appraisal', responseValue: 'A' },
      { sceneKey: 'AN-01', channelKey: 'emotion', responseValue: 101 },
    ])).toThrow('必须是 0–100')
  })
})
