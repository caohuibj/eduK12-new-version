import { afterEach, describe, expect, it } from 'vitest'
import {
  ADEXI_V2_PACKAGE,
  validateScalePackage,
} from '../../modules/scale/scale-package.registry'
import {
  hashScaleDefinition,
  runnerDefinition,
  validateScaleDefinition,
  type ScaleDefinitionV2,
  type ScaleDirection,
} from '../../modules/scale/scale-definition'
import {
  registerScaleCustomScorer,
  scoreScale,
  unregisterScaleCustomScorer,
} from '../../modules/scale/scale-scoring'
import { readScaleResult, scaleAssessmentForResponse, scaleDefinitionFromRecord } from '../../modules/scale/scale-workflow.service'

const makeDefinition = (): ScaleDefinitionV2 => ({
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  source: { title: '测试量表', citation: 'Scale v2 test fixture' },
  license: { status: 'authorized', redistribution: 'allowed' },
  display: { randomizeItems: false },
  responseSets: [{
    key: 'default',
    options: [
      { value: 'never', label: '从不', score: 1 },
      { value: 'rarely', label: '很少', score: 2 },
      { value: 'sometimes', label: '有时', score: 3 },
      { value: 'often', label: '经常', score: 4 },
      { value: 'always', label: '总是', score: 5 },
    ],
  }],
  items: ['A', 'B', 'C'].map((itemCode, sortOrder) => ({
    itemCode,
    content: `题目 ${itemCode}`,
    type: 'single',
    required: true,
    sortOrder,
    responseSetKey: 'default',
    randomizeOptions: false,
  })),
  scoring: {
    scoringVersion: '2.0.0',
    itemRules: ['A', 'B', 'C'].map((itemCode) => ({ itemCode, transform: { type: 'identity' as const } })),
    defaultMissingPolicy: { type: 'complete_required' },
    scores: [{
      key: 'total',
      type: 'total',
      label: '总分',
      description: '测试总分',
      direction: 'descriptive',
      canonical: true,
      displayPrecision: 2,
      source: {
        type: 'items',
        items: ['A', 'B', 'C'].map((itemCode) => ({ itemCode, weight: 1 })),
        aggregation: 'sum',
      },
    }],
  },
  report: {
    reportVersion: '2.0.0',
    primaryScoreKeys: ['total'],
    scoreOrder: ['total'],
    interpretations: [{
      scoreKey: 'total',
      headline: '总分',
      source: { type: 'score_only' },
      summary: '这是一个测试结果。',
      bands: [],
      guidance: [],
    }],
    limitations: [],
    disclaimer: '测试结果不是诊断。',
  },
  referencePolicy: { type: 'none' },
})

const allAnswers = (responseValue: string | number = 'sometimes') => (
  ['A', 'B', 'C'].map((itemCode) => ({ itemCode, responseValue }))
)

const messages = (issues: Array<{ message: string }>) => issues.map((issue) => issue.message).join('\n')

describe('ScaleDefinitionV2 and generic scorer', () => {
  afterEach(() => {
    unregisterScaleCustomScorer('scale-v2-test-scorer')
  })

  it('maps semantic 1–5 responses to scores and keeps the response separate', () => {
    const output = scoreScale(makeDefinition(), [
      { itemCode: 'A', responseValue: 'never' },
      { itemCode: 'B', responseValue: 'sometimes' },
      { itemCode: 'C', responseValue: 'always' },
    ])

    expect(output.scores[0]).toMatchObject({
      key: 'total',
      value: 9,
      range: { min: 3, max: 15 },
      status: 'calculated',
    })
    expect(output.itemScores).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemCode: 'A', responseValue: 'never', baseScore: 1, score: 1 }),
      expect.objectContaining({ itemCode: 'C', responseValue: 'always', baseScore: 5, score: 5 }),
    ]))
  })

  it('supports numeric zero values and a 0–3 response scale', () => {
    const definition = makeDefinition()
    definition.responseSets[0].options = [
      { value: 0, label: '0', score: 0 },
      { value: 1, label: '1', score: 1 },
      { value: 2, label: '2', score: 2 },
      { value: 3, label: '3', score: 3 },
    ]

    const output = scoreScale(definition, { A: 0, B: 1, C: 2 })
    expect(output.scores[0]).toMatchObject({ value: 3, range: { min: 0, max: 9 } })
    expect(output.itemScores[0]).toMatchObject({ responseValue: 0, baseScore: 0, score: 0 })
  })

  it('supports mean, non-contiguous reverse, explicit maps and item-specific response sets', () => {
    const meanDefinition = makeDefinition()
    meanDefinition.scoring.scores[0].source = {
      type: 'items',
      items: ['A', 'B', 'C'].map((itemCode) => ({ itemCode, weight: 1 })),
      aggregation: 'mean',
    }
    expect(scoreScale(meanDefinition, allAnswers('rarely')).scores[0]).toMatchObject({ value: 2, range: { min: 1, max: 5 } })

    const reverseDefinition = makeDefinition()
    reverseDefinition.responseSets[0].options = [
      { value: 'low', label: '低', score: 10 },
      { value: 'mid', label: '中', score: 20 },
      { value: 'high', label: '高', score: 30 },
    ]
    reverseDefinition.scoring.itemRules[0].transform = { type: 'reverse' }
    const reversed = scoreScale(reverseDefinition, { A: 'low', B: 'mid', C: 'high' })
    expect(reversed.itemScores[0]).toMatchObject({ baseScore: 10, score: 30 })
    expect(reversed.scores[0].range).toEqual({ min: 30, max: 90 })

    const mapDefinition = makeDefinition()
    mapDefinition.scoring.itemRules[0].transform = { type: 'map', values: { '1': 10, '2': 20, '3': 30, '4': 40, '5': 50 } }
    expect(scoreScale(mapDefinition, { A: 'always', B: 'never', C: 'never' }).itemScores[0]).toMatchObject({ baseScore: 5, score: 50 })

    const distinctSets = makeDefinition()
    distinctSets.responseSets.push({
      key: 'binary',
      options: [{ value: 'no', label: '否', score: 0 }, { value: 'yes', label: '是', score: 1 }],
    })
    distinctSets.items[2].responseSetKey = 'binary'
    expect(scoreScale(distinctSets, { A: 'never', B: 'always', C: 'yes' }).scores[0]).toMatchObject({ value: 7, range: { min: 2, max: 11 } })
  })

  it('supports dimensions, total plus dimensions, dimensions-only, and weighted aggregation', () => {
    const definition = makeDefinition()
    definition.scoring.scores = [
      {
        key: 'dimension_a',
        type: 'dimension',
        label: '维度 A',
        direction: 'higher_is_more',
        canonical: true,
        displayPrecision: 1,
        source: { type: 'items', items: [{ itemCode: 'A', weight: 1 }, { itemCode: 'B', weight: 1 }], aggregation: 'sum' },
      },
      {
        key: 'dimension_b',
        type: 'dimension',
        label: '维度 B',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 1,
        source: { type: 'items', items: [{ itemCode: 'C', weight: 1 }], aggregation: 'sum' },
      },
      {
        key: 'total',
        type: 'total',
        label: '总分',
        direction: 'descriptive',
        canonical: false,
        displayPrecision: 1,
        source: { type: 'scores', scores: [{ scoreKey: 'dimension_a', weight: 1 }, { scoreKey: 'dimension_b', weight: 1 }], aggregation: 'sum' },
      },
    ]
    const output = scoreScale(definition, allAnswers('sometimes'))
    expect(output.scores.map((score) => [score.key, score.value])).toEqual([
      ['dimension_a', 6],
      ['dimension_b', 3],
      ['total', 9],
    ])
    expect(output.scores.find((score) => score.key === 'total')?.range).toEqual({ min: 3, max: 15 })

    const dimensionsOnly = makeDefinition()
    dimensionsOnly.scoring.scores = definition.scoring.scores.slice(0, 2)
    dimensionsOnly.report.primaryScoreKeys = ['dimension_a', 'dimension_b']
    dimensionsOnly.report.scoreOrder = ['dimension_a', 'dimension_b']
    dimensionsOnly.report.interpretations = dimensionsOnly.report.scoreOrder.map((scoreKey) => ({
      scoreKey,
      headline: scoreKey,
      source: { type: 'score_only' as const },
      summary: '维度解释',
      bands: [],
      guidance: [],
    }))
    expect(scoreScale(dimensionsOnly, allAnswers('sometimes')).scores.map((score) => score.key)).toEqual(['dimension_a', 'dimension_b'])

    const weighted = makeDefinition()
    weighted.scoring.scores[0].source = {
      type: 'items',
      items: [{ itemCode: 'A', weight: 2 }, { itemCode: 'B', weight: 1 }],
      aggregation: 'weighted_sum',
    }
    expect(scoreScale(weighted, { A: 'never', B: 'always' }).scores[0]).toMatchObject({ value: 7, range: { min: 3, max: 15 } })
    weighted.scoring.scores[0].source = { ...weighted.scoring.scores[0].source, aggregation: 'weighted_mean' }
    expect(scoreScale(weighted, { A: 'never', B: 'always' }).scores[0]?.value).toBeCloseTo(7 / 3)
  })

  it('applies missing policies to score-source aggregations as well as item-source scores', () => {
    const definition = makeDefinition()
    definition.scoring.scores = [
      {
        key: 'dimension_a',
        type: 'dimension',
        label: '维度 A',
        direction: 'descriptive',
        canonical: true,
        displayPrecision: 1,
        source: { type: 'items', items: [{ itemCode: 'A', weight: 1 }], aggregation: 'sum' },
      },
      {
        key: 'dimension_b',
        type: 'dimension',
        label: '维度 B',
        direction: 'descriptive',
        canonical: false,
        displayPrecision: 1,
        source: { type: 'items', items: [{ itemCode: 'B', weight: 1 }], aggregation: 'sum' },
      },
      {
        key: 'weighted_total',
        type: 'total',
        label: '加权总分',
        direction: 'descriptive',
        canonical: false,
        displayPrecision: 1,
        source: { type: 'scores', scores: [{ scoreKey: 'dimension_a', weight: 1 }, { scoreKey: 'dimension_b', weight: 1 }], aggregation: 'sum' },
      },
    ]
    definition.report.primaryScoreKeys = ['dimension_a']
    definition.report.scoreOrder = ['dimension_a', 'dimension_b', 'weighted_total']
    definition.report.interpretations = definition.report.scoreOrder.map((scoreKey) => ({
      scoreKey,
      headline: scoreKey,
      source: { type: 'score_only' as const },
      summary: '维度解释',
      bands: [],
      guidance: [],
    }))

    const complete = scoreScale(definition, { A: 'sometimes' })
    expect(complete.scores[2]).toMatchObject({ value: null, status: 'not_calculable', prorated: false })

    definition.scoring.scores[2].missingPolicy = { type: 'allow_missing_without_proration' }
    const partial = scoreScale(definition, { A: 'sometimes' })
    expect(partial.scores[2]).toMatchObject({ value: 3, status: 'limited', prorated: false, answeredItems: ['A'] })

    definition.scoring.scores[2].missingPolicy = { type: 'prorate_if_min_answered', minimumAnswered: 1 }
    const prorated = scoreScale(definition, { A: 'sometimes' })
    expect(prorated.scores[2]).toMatchObject({ value: 6, status: 'limited', prorated: true })
  })

  it('implements all missing policies with explicit quality states', () => {
    const complete = makeDefinition()
    expect(scoreScale(complete, { A: 'always' }).quality).toEqual({ status: 'invalid', flags: ['missing_items', 'score_not_calculable'] })
    expect(scoreScale(complete, { A: 'always' }).scores[0]).toMatchObject({ value: null, status: 'not_calculable', prorated: false })

    const allowMissing = makeDefinition()
    allowMissing.scoring.scores[0].missingPolicy = { type: 'allow_missing_without_proration' }
    expect(scoreScale(allowMissing, { A: 'always' }).scores[0]).toMatchObject({ value: 5, status: 'limited', prorated: false })
    expect(scoreScale(allowMissing, { A: 'always' }).quality.status).toBe('limited')

    const prorated = makeDefinition()
    prorated.scoring.scores[0].missingPolicy = { type: 'prorate_if_min_answered', minimumAnswered: 2 }
    expect(scoreScale(prorated, { A: 'never', B: 'rarely' }).scores[0]).toMatchObject({ value: 4.5, status: 'limited', prorated: true })
    expect(scoreScale(prorated, { A: 'never' }).scores[0]).toMatchObject({ value: null, status: 'not_calculable' })
    expect(scoreScale(prorated, { A: 'never' }).quality.flags).toContain('insufficient_items')

    const sourceDefined = makeDefinition()
    sourceDefined.scoring.defaultMissingPolicy = { type: 'source_defined' }
    sourceDefined.scoring.scores[0].missingPolicy = { type: 'source_defined' }
    sourceDefined.scoring.scorerKey = 'scale-v2-test-scorer'
    sourceDefined.scoring.scores[0].range = { min: 0, max: 99 }
    registerScaleCustomScorer('scale-v2-test-scorer', ({ definition, itemScores }) => ({
      scores: [{
        key: 'total',
        type: 'total',
        label: '专用计分总分',
        direction: 'descriptive',
        canonical: true,
        displayPrecision: 0,
        value: itemScores.length === definition.items.length ? 99 : null,
        range: { min: 0, max: 99 },
        expectedItems: definition.items.map((item) => item.itemCode),
        answeredItems: itemScores.map((item) => item.itemCode),
        status: itemScores.length === definition.items.length ? 'calculated' : 'not_calculable',
        prorated: false,
      }],
    }))
    expect(scoreScale(sourceDefined, allAnswers('never')).scores[0]).toMatchObject({ value: 99, status: 'calculated' })
    expect(scoreScale(sourceDefined, { A: 'never' }).quality.status).toBe('invalid')
  })

  it('preserves direction semantics without deriving good/bad labels', () => {
    const directions: ScaleDirection[] = [
      'higher_is_better',
      'higher_is_worse',
      'higher_is_more',
      'lower_is_better',
      'bipolar',
      'descriptive',
    ]
    directions.forEach((direction) => {
      const definition = makeDefinition()
      definition.scoring.scores[0].direction = direction
      expect(scoreScale(definition, allAnswers()).scores[0].direction).toBe(direction)
    })
  })

  it('rejects incomplete map transforms, cycles, unknown references, and definitions without canonical scores', () => {
    const incompleteMap = makeDefinition()
    incompleteMap.scoring.itemRules[0].transform = { type: 'map', values: { '1': 10 } }
    expect(messages(validateScaleDefinition(incompleteMap).issues)).toContain('transform map 未覆盖基础分值：2')

    const noCanonical = makeDefinition()
    noCanonical.scoring.scores[0].canonical = false
    expect(messages(validateScaleDefinition(noCanonical).issues)).toContain('至少需要一个 canonical score')

    const unknownItem = makeDefinition()
    unknownItem.scoring.scores[0].source = {
      type: 'items',
      items: [{ itemCode: 'UNKNOWN', weight: 1 }],
      aggregation: 'sum',
    }
    expect(messages(validateScaleDefinition(unknownItem).issues)).toContain('score 引用了不存在的题目：UNKNOWN')

    const cycle = makeDefinition()
    cycle.scoring.scores = [
      {
        key: 'a',
        type: 'dimension',
        label: 'A',
        direction: 'descriptive',
        canonical: true,
        displayPrecision: 0,
        source: { type: 'scores', scores: [{ scoreKey: 'b', weight: 1 }], aggregation: 'sum' },
      },
      {
        key: 'b',
        type: 'dimension',
        label: 'B',
        direction: 'descriptive',
        canonical: false,
        displayPrecision: 0,
        source: { type: 'scores', scores: [{ scoreKey: 'a', weight: 1 }], aggregation: 'sum' },
      },
    ]
    cycle.report.primaryScoreKeys = ['a']
    cycle.report.scoreOrder = ['a', 'b']
    cycle.report.interpretations = ['a', 'b'].map((scoreKey) => ({
      scoreKey,
      headline: scoreKey,
      source: { type: 'score_only' as const },
      summary: '解释',
      bands: [],
      guidance: [],
    }))
    expect(messages(validateScaleDefinition(cycle).issues)).toContain('score 依赖存在循环：a')
  })

  it('keeps definition hashes stable and hides option scores from the runner', () => {
    const definition = makeDefinition()
    const reordered = JSON.parse(JSON.stringify(definition)) as ScaleDefinitionV2
    reordered.report = { ...reordered.report, disclaimer: '测试结果不是诊断。' }
    expect(hashScaleDefinition(definition)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashScaleDefinition(definition)).toBe(hashScaleDefinition(JSON.parse(JSON.stringify(definition)) as ScaleDefinitionV2))
    expect(runnerDefinition(definition).items[0].options[0]).toEqual({ value: 'never', label: '从不' })
    expect(runnerDefinition(definition).items[0].options[0]).not.toHaveProperty('score')
    expect(reordered).toBeTruthy()
  })

  it('does not expose the authoritative scoring definition through an assessment response', () => {
    const response = scaleAssessmentForResponse({
      id: 'assessment-1',
      answers: [],
      result: null,
      scale: { id: 'scale-1', name: '测试量表', definition: makeDefinition() },
    })
    expect(response.scale).toMatchObject({ id: 'scale-1', name: '测试量表' })
    expect(response.scale).not.toHaveProperty('definition')
  })

  it('rejects malformed frozen results and refuses a divergent standard package snapshot', () => {
    expect(readScaleResult({ schemaVersion: 2 })).toEqual({ result: null, decryptError: true })
    expect(readScaleResult({ schemaVersion: 1, scores: [], feedback: {} })).toEqual({ result: null, decryptError: true })

    expect(scaleDefinitionFromRecord({
      code: ADEXI_V2_PACKAGE.key,
      instrumentVersion: ADEXI_V2_PACKAGE.instrumentVersion,
      instrumentClass: 'STANDARD',
      definition: { schemaVersion: 2 },
    })).toBe(ADEXI_V2_PACKAGE.definition)
    expect(() => scaleDefinitionFromRecord({
      code: ADEXI_V2_PACKAGE.key,
      instrumentVersion: ADEXI_V2_PACKAGE.instrumentVersion,
      instrumentClass: 'STANDARD',
      definition: ADEXI_V2_PACKAGE.definition,
      definitionHash: '0'.repeat(64),
    })).toThrow('definition 与代码 package 不一致')
  })
})

describe('standard ScalePackageV2 release gate', () => {
  it('validates ADEXI as a hidden draft package with two canonical dimensions and no total', () => {
    const gate = validateScalePackage(ADEXI_V2_PACKAGE)
    expect(gate.valid).toBe(true)
    expect(gate.definitionHash).toMatch(/^[a-f0-9]{64}$/)
    expect(ADEXI_V2_PACKAGE.releaseStatus).toBe('DRAFT')
    expect(ADEXI_V2_PACKAGE.definition.scoring.scores.map((score) => score.key)).toEqual(['working_memory', 'inhibition'])
    expect(ADEXI_V2_PACKAGE.definition.scoring.scores.every((score) => score.canonical)).toBe(true)
    expect(ADEXI_V2_PACKAGE.definition.scoring.scores.some((score) => score.type === 'total')).toBe(false)
    expect(ADEXI_V2_PACKAGE.references).toEqual([])
    expect(runnerDefinition(ADEXI_V2_PACKAGE.definition).items[0].options[0]).not.toHaveProperty('score')
    expect(scoreScale(ADEXI_V2_PACKAGE.definition, ADEXI_V2_PACKAGE.goldenCases[1].answers).scores).toEqual([
      expect.objectContaining({ key: 'working_memory', value: 45, range: { min: 9, max: 45 } }),
      expect.objectContaining({ key: 'inhibition', value: 25, range: { min: 5, max: 25 } }),
    ])
  })
})
