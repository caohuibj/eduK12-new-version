import { describe, expect, it } from 'vitest'
import {
  hashSituationDefinition,
  runnerSituationDefinition,
  validateSituationDefinition,
  type SituationDefinitionV1,
} from '../../modules/situational/situation-definition'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import { SJT_ANXIETY_GOLDEN_ZH_CN_V1_DEFINITION } from '../../modules/situational/packages/sjt-anxiety-golden-zh-cn-v1'

const baseDefinition: SituationDefinitionV1 = SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION

const clone = (definition: SituationDefinitionV1): SituationDefinitionV1 => JSON.parse(JSON.stringify(definition)) as SituationDefinitionV1

const errorPaths = (issues: Array<{ path: string; severity: string }>): string[] => (
  issues.filter((issue) => issue.severity === 'error').map((issue) => issue.path)
)

describe('situation definition schema', () => {
  it('accepts the golden assertiveness definition', () => {
    const result = validateSituationDefinition(baseDefinition)
    expect(result.definition).toBeDefined()
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([])
  })

  it('rejects duplicate scene keys', () => {
    const definition = clone(baseDefinition)
    definition.scenes[1]!.sceneKey = 'AS-01'
    const result = validateSituationDefinition(definition)
    expect(errorPaths(result.issues)).toContain('scenes.1.sceneKey')
  })

  it('rejects duplicate channel keys within one scene', () => {
    const definition = clone(baseDefinition)
    definition.scenes[0]!.channels.push({ ...definition.scenes[0]!.channels[0]!, prompt: '重复通道' })
    const result = validateSituationDefinition(definition)
    expect(errorPaths(result.issues)).toContain('scenes.0.channels.1.channelKey')
  })

  it('rejects more than three channels per scene (Decision C)', () => {
    const definition = clone(baseDefinition)
    const scene = definition.scenes[0]!
    scene.channels = [
      ...scene.channels,
      {
        channelKey: 'norm',
        purpose: 'NORM_JUDGMENT',
        responseType: 'SINGLE_CHOICE',
        scoredConstruct: 'bfi2.assertiveness',
        prompt: '你认为最合适的做法是什么？',
        options: scene.channels[0]!.options,
      },
      {
        channelKey: 'appraisal',
        purpose: 'APPRAISAL',
        responseType: 'SINGLE_CHOICE',
        scoredConstruct: 'bfi2.assertiveness',
        prompt: '你认为问题的关键是什么？',
        options: scene.channels[0]!.options,
      },
      {
        channelKey: 'emotion',
        purpose: 'EMOTION',
        responseType: 'CONTINUOUS',
        scoredConstruct: 'bfi2.assertiveness',
        prompt: '此刻你有多紧张？',
        range: { min: 0, max: 100 },
        scoringDirection: 'POSITIVE',
      },
    ] as SituationDefinitionV1['scenes'][number]['channels']
    const result = validateSituationDefinition(definition)
    expect(result.definition).toBeUndefined()
    expect(JSON.stringify(result.issues)).toContain('at most 3')
  })

  it('rejects channel constructs that the scene does not declare', () => {
    const definition = clone(baseDefinition)
    definition.scenes[0]!.channels[0]!.scoredConstruct = 'bfi2.other'
    const result = validateSituationDefinition(definition)
    expect(errorPaths(result.issues)).toContain('scenes.0.channels.0.scoredConstruct')
  })

  it('rejects a scene channel without a published metric (Decision B)', () => {
    const definition = clone(baseDefinition)
    definition.scenes[0]!.channels.push({
      channelKey: 'norm',
      purpose: 'NORM_JUDGMENT',
      responseType: 'SINGLE_CHOICE',
      scoredConstruct: 'bfi2.assertiveness',
      prompt: '你认为最合适的做法是什么？',
      options: definition.scenes[0]!.channels[0]!.options,
    })
    const result = validateSituationDefinition(definition)
    expect(errorPaths(result.issues).some((path) => path.startsWith('scenes.0.channels.1'))).toBe(true)
  })

  it('rejects a published metric without any backing scene channel', () => {
    const definition = clone(baseDefinition)
    definition.scoring.publishedMetrics.push({
      key: 'bfi2.assertiveness.norm',
      label: '无支撑 metric',
      construct: 'bfi2.assertiveness',
      channelKey: 'norm',
      direction: 'higher_is_more',
      role: 'secondary',
      displayPrecision: 2,
    })
    const result = validateSituationDefinition(definition)
    expect(errorPaths(result.issues)).toContain('scoring.publishedMetrics.1')
  })

  it('rejects choice contributions that miss an option or reference an unknown pair', () => {
    const definition = clone(baseDefinition)
    definition.scoring.choiceScores = definition.scoring.choiceScores.filter((entry) => !(entry.sceneKey === 'AS-01' && entry.optionKey === 'D'))
    const missing = validateSituationDefinition(definition)
    expect(JSON.stringify(missing.issues)).toContain('选项缺少计分贡献：AS-01:behavior:D')

    const orphan = clone(baseDefinition)
    orphan.scoring.choiceScores.push({ sceneKey: 'AS-99', channelKey: 'behavior', optionKey: 'A', contribution: 1 })
    const orphanResult = validateSituationDefinition(orphan)
    expect(JSON.stringify(orphanResult.issues)).toContain('计分贡献引用了不存在的场景通道：AS-99:behavior')
  })

  it('rejects contributions on continuous channels', () => {
    const definition = clone(baseDefinition)
    definition.scenes[0]!.channels.push({
      channelKey: 'emotion',
      purpose: 'EMOTION',
      responseType: 'CONTINUOUS',
      scoredConstruct: 'bfi2.assertiveness',
      prompt: '此刻你有多紧张？',
      range: { min: 0, max: 100 },
      scoringDirection: 'POSITIVE',
    })
    definition.scoring.publishedMetrics.push({
      key: 'bfi2.assertiveness.emotion',
      label: '情绪 metric',
      construct: 'bfi2.assertiveness',
      channelKey: 'emotion',
      direction: 'higher_is_more',
      role: 'secondary',
      displayPrecision: 1,
    })
    definition.scoring.choiceScores.push({ sceneKey: 'AS-01', channelKey: 'emotion', optionKey: 'A', contribution: 1 })
    const result = validateSituationDefinition(definition)
    expect(JSON.stringify(result.issues)).toContain('连续评分通道不接受选项贡献：AS-01:emotion')
  })

  it('rejects a continuous channel whose range is inverted', () => {
    const definition = clone(baseDefinition)
    definition.scenes[0]!.channels[0] = {
      channelKey: 'confidence',
      purpose: 'CONFIDENCE',
      responseType: 'CONTINUOUS',
      scoredConstruct: 'bfi2.assertiveness',
      prompt: '你有多大把握？',
      range: { min: 100, max: 0 },
      scoringDirection: 'NEGATIVE',
    } as SituationDefinitionV1['scenes'][number]['channels'][number]
    definition.scoring.publishedMetrics = [{
      key: 'bfi2.assertiveness.confidence',
      label: '把握度 metric',
      construct: 'bfi2.assertiveness',
      channelKey: 'confidence',
      direction: 'higher_is_more',
      role: 'primary',
      displayPrecision: 2,
    }]
    definition.scoring.choiceScores = []
    const result = validateSituationDefinition(definition)
    expect(errorPaths(result.issues)).toContain('scenes.0.channels.0.range')
  })

  it('rejects report orders and interpretations that do not cover every published metric', () => {
    const definition = clone(baseDefinition)
    definition.report.metricOrder = ['other.metric']
    const result = validateSituationDefinition(definition)
    expect(JSON.stringify(result.issues)).toContain('报告引用了不存在的 metric：other.metric')
    expect(JSON.stringify(result.issues)).toContain('报告缺少 metric：bfi2.assertiveness.behavior')

    const noInterpretation = clone(baseDefinition)
    noInterpretation.report.interpretations = []
    const interpretationResult = validateSituationDefinition(noInterpretation)
    expect(JSON.stringify(interpretationResult.issues)).toContain('报告缺少 metric 解释：bfi2.assertiveness.behavior')
  })

  it('rejects a fixed scene sample larger than the scene bank', () => {
    const definition = clone(baseDefinition)
    definition.sampling = { strategy: 'FIXED_SCENE_SAMPLE', scenesPerAssignment: 5 }
    const result = validateSituationDefinition(definition)
    expect(errorPaths(result.issues)).toContain('sampling.scenesPerAssignment')
  })

  it('requires provenance, license, disclaimer and a golden fixture for publish', () => {
    const result = validateSituationDefinition(baseDefinition, { forPublish: true, requireGoldenFixture: true, hasGoldenFixture: false })
    expect(errorPaths(result.issues)).toContain('goldenFixture')

    const anonymous = clone(baseDefinition)
    anonymous.source = {}
    anonymous.license = { status: 'unknown', redistribution: 'unknown' }
    anonymous.report.disclaimer = ' '
    const publishResult = validateSituationDefinition(anonymous, { forPublish: true })
    const paths = errorPaths(publishResult.issues)
    expect(paths).toContain('source')
    expect(paths).toContain('license')
    expect(paths).toContain('report.disclaimer')
  })
})

describe('situation definition hash and runner view', () => {
  it('produces a stable hash that changes with content', () => {
    const first = hashSituationDefinition(baseDefinition)
    const second = hashSituationDefinition(baseDefinition)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(second).toBe(first)
    const changed = clone(baseDefinition)
    changed.scenes[0]!.title = '改动后的标题'
    expect(hashSituationDefinition(changed)).not.toBe(first)
  })

  it('keeps constructs, contributions and scientific metadata out of the runner payload', () => {
    const runner = runnerSituationDefinition(baseDefinition)
    const serialized = JSON.stringify(runner)
    expect(serialized).not.toContain('choiceScores')
    expect(serialized).not.toContain('contribution')
    expect(serialized).not.toContain('scoredConstruct')
    expect(serialized).not.toContain('situationFeatures')
    expect(serialized).not.toContain('secondaryConstructs')
    expect(serialized).not.toContain('purpose')
    expect(serialized).not.toContain('scoringDirection')
    expect(runner.scenes.map((scene) => scene.sceneKey)).toEqual(['AS-01', 'AS-02'])
    runner.scenes.forEach((scene) => {
      scene.channels.forEach((channel) => {
        if (channel.responseType === 'SINGLE_CHOICE') {
          channel.options.forEach((option) => {
            expect(Object.keys(option).sort()).toEqual(['label', 'optionKey'])
          })
        }
      })
    })
  })

  it('exposes the continuous answer range but not its scoring direction to the runner', () => {
    const runner = runnerSituationDefinition(SJT_ANXIETY_GOLDEN_ZH_CN_V1_DEFINITION)
    const serialized = JSON.stringify(runner)
    expect(serialized).toContain('"range":{"min":0,"max":100}')
    expect(serialized).not.toContain('scoringDirection')
    expect(serialized).not.toContain('purpose')
    expect(serialized).not.toContain('scoredConstruct')
  })
})
