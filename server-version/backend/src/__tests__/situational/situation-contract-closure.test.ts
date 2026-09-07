import { describe, expect, it } from 'vitest'
import { compileSituationRuntime } from '../../modules/assessment-runtime/compiler'
import {
  hashSituationDefinition,
  validateSituationDefinition,
  type SituationDefinitionV1,
} from '../../modules/situational/situation-definition'
import { scoreSituational } from '../../modules/situational/situation-scoring'
import { SJT_ANXIETY_GOLDEN_ZH_CN_V1_DEFINITION } from '../../modules/situational/packages/sjt-anxiety-golden-zh-cn-v1'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'

const clone = (definition: SituationDefinitionV1): SituationDefinitionV1 => (
  JSON.parse(JSON.stringify(definition)) as SituationDefinitionV1
)

const errors = (definition: SituationDefinitionV1): string[] => (
  validateSituationDefinition(definition).issues
    .filter((issue) => issue.severity === 'error')
    .map((issue) => `${issue.path}: ${issue.message}`)
)

const convertAssertivenessToContinuous = (): SituationDefinitionV1 => {
  const definition = clone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION)
  definition.scenes.forEach((scene) => {
    scene.channels = [{
      channelKey: 'behavior',
      purpose: 'BEHAVIOR_TENDENCY',
      responseType: 'CONTINUOUS',
      scoredConstruct: 'bfi2.assertiveness',
      prompt: '你有多可能这样做？',
      range: { min: 0, max: 100 },
      scoringDirection: 'POSITIVE',
    }]
  })
  definition.scoring.choiceScores = []
  return definition
}

describe('situational PR-A contract closure', () => {
  it('reserves colon from scene/channel/option identities used in composite response keys', () => {
    const sceneKey = clone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION)
    sceneKey.scenes[0]!.sceneKey = 'AS:01'
    expect(errors(sceneKey).join('|')).toContain('标识符不能为空白且不能包含冒号')

    const channelKey = clone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION)
    channelKey.scenes[0]!.channels[0]!.channelKey = 'be:havior'
    expect(errors(channelKey).join('|')).toContain('标识符不能为空白且不能包含冒号')

    const optionKey = clone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION)
    const firstChannel = optionKey.scenes[0]!.channels[0]!
    if (firstChannel.responseType !== 'SINGLE_CHOICE') throw new Error('fixture must be choice')
    firstChannel.options[0]!.optionKey = 'A:1'
    expect(errors(optionKey).join('|')).toContain('标识符不能为空白且不能包含冒号')
  })

  it('rejects duplicate optionKey values within one choice channel', () => {
    const definition = clone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION)
    const channel = definition.scenes[0]!.channels[0]!
    if (channel.responseType !== 'SINGLE_CHOICE') throw new Error('fixture must be choice')
    channel.options[1]!.optionKey = channel.options[0]!.optionKey
    expect(errors(definition).join('|')).toContain('同一选择通道内 optionKey 不能重复')
  })

  it('rejects one metric backed by channels with different psychological purposes', () => {
    const definition = clone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION)
    definition.scenes[1]!.channels[0]!.purpose = 'EMOTION'
    expect(errors(definition).join('|')).toContain('同一 metric 的通道 purpose 必须一致')
    expect(() => compileSituationRuntime({
      instrumentKey: 'sjt-assertiveness-golden',
      instrumentVersion: '1.0.0',
      definition,
    })).toThrow('Situational definition is invalid')
  })

  it('rejects one metric backed by mixed response primitives', () => {
    const definition = clone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION)
    definition.scenes[1]!.channels = [{
      channelKey: 'behavior',
      purpose: 'BEHAVIOR_TENDENCY',
      responseType: 'CONTINUOUS',
      scoredConstruct: 'bfi2.assertiveness',
      prompt: '你有多可能这样做？',
      range: { min: 0, max: 100 },
      scoringDirection: 'POSITIVE',
    }]
    definition.scoring.choiceScores = definition.scoring.choiceScores.filter((entry) => entry.sceneKey !== 'AS-02')
    expect(errors(definition).join('|')).toContain('同一 metric 不能混合不同 responseType')
  })

  it('requires one continuous metric to keep range and scoring direction stable across scenes', () => {
    const rangeMismatch = convertAssertivenessToContinuous()
    const secondRangeChannel = rangeMismatch.scenes[1]!.channels[0]!
    if (secondRangeChannel.responseType !== 'CONTINUOUS') throw new Error('fixture must be continuous')
    secondRangeChannel.range = { min: 0, max: 10 }
    expect(errors(rangeMismatch).join('|')).toContain('同一 CONTINUOUS metric 的 range 必须一致')

    const directionMismatch = convertAssertivenessToContinuous()
    const secondDirectionChannel = directionMismatch.scenes[1]!.channels[0]!
    if (secondDirectionChannel.responseType !== 'CONTINUOUS') throw new Error('fixture must be continuous')
    secondDirectionChannel.scoringDirection = 'NEGATIVE'
    expect(errors(directionMismatch).join('|')).toContain('同一 CONTINUOUS metric 的 scoringDirection 必须一致')
  })

  it('keeps report.primaryMetricKeys and scoring metric roles as one consistent truth', () => {
    const definition = clone(SJT_ANXIETY_GOLDEN_ZH_CN_V1_DEFINITION)
    const emotion = definition.scoring.publishedMetrics.find((metric) => metric.key === 'bfi2.anxiety.emotion')!
    emotion.role = 'secondary'
    expect(errors(definition).join('|')).toContain('报告主 metric 必须声明 role=primary：bfi2.anxiety.emotion')

    const omitted = clone(SJT_ANXIETY_GOLDEN_ZH_CN_V1_DEFINITION)
    omitted.report.primaryMetricKeys = ['bfi2.anxiety.appraisal']
    expect(errors(omitted).join('|')).toContain('role=primary 的 metric 必须进入 report.primaryMetricKeys：bfi2.anxiety.emotion')
  })

  it('rejects duplicate report metric order entries', () => {
    const definition = clone(SJT_ANXIETY_GOLDEN_ZH_CN_V1_DEFINITION)
    definition.report.metricOrder = [
      'bfi2.anxiety.appraisal',
      'bfi2.anxiety.appraisal',
      'bfi2.anxiety.emotion',
    ]
    expect(errors(definition).join('|')).toContain('报告 metricOrder 不能重复：bfi2.anxiety.appraisal')
  })

  it('reports the theoretical range of a cross-scene mean, not the outer envelope', () => {
    const definition = clone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION)
    definition.scoring.choiceScores.forEach((entry) => {
      if (entry.sceneKey === 'AS-02') entry.contribution *= 0.5
    })
    const result = scoreSituational(definition, [
      { sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'A' },
      { sceneKey: 'AS-02', channelKey: 'behavior', responseValue: 'A' },
    ])
    expect(result.metrics[0]?.value).toBeCloseTo(1.125, 10)
    expect(result.metrics[0]?.range).toEqual({ min: -1.125, max: 1.125 })
  })

  it('treats the full definition hash as authoritative and rejects caller overrides', () => {
    const definition = SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION
    const authoritativeHash = hashSituationDefinition(definition)
    expect(compileSituationRuntime({
      instrumentKey: 'sjt-assertiveness-golden',
      instrumentVersion: '1.0.0',
      definition,
      sourceDefinitionHash: authoritativeHash,
    }).sourceDefinitionHash).toBe(authoritativeHash)

    expect(() => compileSituationRuntime({
      instrumentKey: 'sjt-assertiveness-golden',
      instrumentVersion: '1.0.0',
      definition,
      sourceDefinitionHash: '0'.repeat(64),
    })).toThrow('Situational sourceDefinitionHash must match the authoritative definition hash')
  })
})
