import {
  itemForCode,
  responseSetForItem,
  scaleDefinitionSchema,
  type ScaleAggregation,
  type ScaleDefinitionV2,
  type ScaleMissingPolicy,
  type ScaleResponseValue,
  type ScaleScoreDefinition,
  type ScaleTransform,
} from './scale-definition'

/** A persisted answer. The response value is deliberately not a score. */
export interface ScaleAnswer {
  itemCode: string
  responseValue: ScaleResponseValue
  responseTimeMs?: number
  answeredAt?: string
  changeCount?: number
}

export interface ScoredItem {
  itemCode: string
  responseValue: ScaleResponseValue
  baseScore: number
  score: number
  responseTimeMs?: number
  answeredAt?: string
  changeCount?: number
}

export type ScaleScoreStatus = 'calculated' | 'limited' | 'not_calculable'

export interface ScaleScoreRange {
  min: number
  max: number
}

export interface ScaleScoreValue {
  key: string
  type: ScaleScoreDefinition['type']
  label: string
  description?: string
  direction: ScaleScoreDefinition['direction']
  canonical: boolean
  displayPrecision: number
  value: number | null
  range: ScaleScoreRange | null
  expectedItems: string[]
  answeredItems: string[]
  status: ScaleScoreStatus
  prorated: boolean
}

export type ScaleQualityStatus = 'interpretable' | 'limited' | 'invalid'

export interface ScaleQuality {
  status: ScaleQualityStatus
  flags: Array<'missing_items' | 'insufficient_items' | 'score_not_calculable'>
}

export interface ScaleScoringOutput {
  itemScores: ScoredItem[]
  scores: ScaleScoreValue[]
  quality: ScaleQuality
}

export interface ScaleAnswerIssue {
  path: string
  message: string
}

export class ScaleAnswerValidationError extends Error {
  readonly issues: ScaleAnswerIssue[]

  constructor(issues: ScaleAnswerIssue[]) {
    super('量表回答不合法')
    this.name = 'ScaleAnswerValidationError'
    this.issues = issues
  }
}

export interface ScaleCustomScorerInput {
  definition: ScaleDefinitionV2
  answers: ScaleAnswer[]
  itemScores: ScoredItem[]
}

export interface ScaleCustomScorerOutput {
  scores: ScaleScoreValue[]
  quality?: ScaleQuality
}

export type ScaleCustomScorer = (input: ScaleCustomScorerInput) => ScaleCustomScorerOutput

const customScorerRegistry = new Map<string, ScaleCustomScorer>()

export const registerScaleCustomScorer = (key: string, scorer: ScaleCustomScorer): void => {
  customScorerRegistry.set(key, scorer)
}

export const unregisterScaleCustomScorer = (key: string): void => {
  customScorerRegistry.delete(key)
}

export const getScaleCustomScorerKeys = (): Set<string> => new Set(customScorerRegistry.keys())

const sameResponseValue = (left: ScaleResponseValue, right: ScaleResponseValue): boolean => (
  typeof left === typeof right && left === right
)

const responseValueKey = (value: ScaleResponseValue): string => `${typeof value}:${String(value)}`

const finite = (value: number): number => {
  if (!Number.isFinite(value)) throw new Error('计分结果必须是有限数字')
  return value
}

const rangeOf = (values: number[]): ScaleScoreRange => {
  if (values.length === 0) return { min: 0, max: 0 }
  return { min: Math.min(...values), max: Math.max(...values) }
}

const transformScore = (transform: ScaleTransform, baseScore: number, responseScores: number[]): number => {
  if (transform.type === 'identity') return finite(baseScore)
  if (transform.type === 'reverse') {
    const min = Math.min(...responseScores)
    const max = Math.max(...responseScores)
    return finite(min + max - baseScore)
  }
  const mapped = transform.values[String(baseScore)]
  if (mapped === undefined) throw new Error(`transform map 未覆盖基础分值：${baseScore}`)
  return finite(mapped)
}

const valuesForTransform = (transform: ScaleTransform, responseScores: number[]): number[] => (
  responseScores.map((score) => transformScore(transform, score, responseScores))
)

const aggregate = (
  values: Array<{ value: number; weight: number }>,
  aggregation: ScaleAggregation,
): number => {
  if (values.length === 0) throw new Error('没有可聚合的分值')
  const weightedTotal = values.reduce((total, entry) => total + entry.value * entry.weight, 0)
  const totalWeight = values.reduce((total, entry) => total + entry.weight, 0)
  if (aggregation === 'sum' || aggregation === 'weighted_sum') return finite(weightedTotal)
  if (aggregation === 'mean') return finite(values.reduce((total, entry) => total + entry.value, 0) / values.length)
  return finite(weightedTotal / totalWeight)
}

const aggregateRange = (
  ranges: Array<{ range: ScaleScoreRange; weight: number }>,
  aggregation: ScaleAggregation,
): ScaleScoreRange => {
  if (ranges.length === 0) return { min: 0, max: 0 }
  if (aggregation === 'sum' || aggregation === 'weighted_sum') {
    return {
      min: ranges.reduce((total, entry) => total + entry.range.min * entry.weight, 0),
      max: ranges.reduce((total, entry) => total + entry.range.max * entry.weight, 0),
    }
  }
  if (aggregation === 'mean') {
    return {
      min: ranges.reduce((total, entry) => total + entry.range.min, 0) / ranges.length,
      max: ranges.reduce((total, entry) => total + entry.range.max, 0) / ranges.length,
    }
  }
  const totalWeight = ranges.reduce((total, entry) => total + entry.weight, 0)
  return {
    min: ranges.reduce((total, entry) => total + entry.range.min * entry.weight, 0) / totalWeight,
    max: ranges.reduce((total, entry) => total + entry.range.max * entry.weight, 0) / totalWeight,
  }
}

const addFlag = (flags: ScaleQuality['flags'], flag: ScaleQuality['flags'][number]): void => {
  if (!flags.includes(flag)) flags.push(flag)
}

const policyFor = (definition: ScaleDefinitionV2, score: ScaleScoreDefinition): ScaleMissingPolicy => (
  score.missingPolicy ?? definition.scoring.defaultMissingPolicy
)

const expectedItemsFor = (definition: ScaleDefinitionV2, score: ScaleScoreDefinition): string[] => {
  if (score.source.type === 'items') return score.source.items.map((item) => item.itemCode)
  return score.source.scores.flatMap((component) => {
    const nested = definition.scoring.scores.find((candidate) => candidate.key === component.scoreKey)
    return nested ? expectedItemsFor(definition, nested) : []
  }).filter((itemCode, index, all) => all.indexOf(itemCode) === index)
}

const itemRanges = (definition: ScaleDefinitionV2): Map<string, ScaleScoreRange> => {
  const rules = new Map(definition.scoring.itemRules.map((rule) => [rule.itemCode, rule]))
  const output = new Map<string, ScaleScoreRange>()
  definition.items.forEach((item) => {
    const responseSet = responseSetForItem(definition, item)
    const baseScores = responseSet.options.map((option) => option.score)
    const rule = rules.get(item.itemCode)
    output.set(item.itemCode, rangeOf(valuesForTransform(rule?.transform ?? { type: 'identity' }, baseScores)))
  })
  return output
}

const scoreRangeFor = (
  definition: ScaleDefinitionV2,
  score: ScaleScoreDefinition,
  ranges: Map<string, ScaleScoreRange>,
  scoreRanges: Map<string, ScaleScoreRange>,
): ScaleScoreRange => {
  if (score.source.type === 'items') {
    return aggregateRange(score.source.items.map((item) => ({
      range: ranges.get(item.itemCode) ?? { min: 0, max: 0 },
      weight: item.weight,
    })), score.source.aggregation)
  }
  return aggregateRange(score.source.scores.map((component) => ({
    range: scoreRanges.get(component.scoreKey) ?? { min: 0, max: 0 },
    weight: component.weight,
  })), score.source.aggregation)
}

const normalizeAnswers = (answers: ScaleAnswer[] | Record<string, ScaleResponseValue>): ScaleAnswer[] => (
  Array.isArray(answers)
    ? answers
    : Object.entries(answers).map(([itemCode, responseValue]) => ({ itemCode, responseValue }))
)

const validateAnswers = (definition: ScaleDefinitionV2, answers: ScaleAnswer[]): Map<string, ScaleAnswer> => {
  const issues: ScaleAnswerIssue[] = []
  const items = new Map(definition.items.map((item) => [item.itemCode, item]))
  const answerByItem = new Map<string, ScaleAnswer>()

  answers.forEach((answer, index) => {
    const path = `answers.${index}`
    if (!items.has(answer.itemCode)) {
      issues.push({ path: `${path}.itemCode`, message: `题目不存在：${answer.itemCode}` })
      return
    }
    if (answerByItem.has(answer.itemCode)) {
      issues.push({ path: `${path}.itemCode`, message: `题目重复回答：${answer.itemCode}` })
      return
    }
    if (answer.responseTimeMs !== undefined && (!Number.isFinite(answer.responseTimeMs) || answer.responseTimeMs < 0)) {
      issues.push({ path: `${path}.responseTimeMs`, message: 'responseTimeMs 必须是非负有限数字' })
    }
    if (answer.changeCount !== undefined && (!Number.isInteger(answer.changeCount) || answer.changeCount < 0)) {
      issues.push({ path: `${path}.changeCount`, message: 'changeCount 必须是非负整数' })
    }
    const item = items.get(answer.itemCode)
    if (!item) return
    const responseSet = responseSetForItem(definition, item)
    if (!responseSet.options.some((option) => sameResponseValue(option.value, answer.responseValue))) {
      issues.push({ path: `${path}.responseValue`, message: `响应值不属于题目 ${answer.itemCode} 的响应集` })
    }
    answerByItem.set(answer.itemCode, answer)
  })

  if (issues.length > 0) throw new ScaleAnswerValidationError(issues)
  return answerByItem
}

const scoreItems = (definition: ScaleDefinitionV2, answers: Map<string, ScaleAnswer>): ScoredItem[] => {
  const rules = new Map(definition.scoring.itemRules.map((rule) => [rule.itemCode, rule]))
  return definition.items.flatMap((item) => {
    const answer = answers.get(item.itemCode)
    if (!answer) return []
    const responseSet = responseSetForItem(definition, item)
    const option = responseSet.options.find((candidate) => sameResponseValue(candidate.value, answer.responseValue))
    if (!option) return []
    const rule = rules.get(item.itemCode)
    const responseScores = responseSet.options.map((candidate) => candidate.score)
    return [{
      itemCode: item.itemCode,
      responseValue: answer.responseValue,
      baseScore: option.score,
      score: transformScore(rule?.transform ?? { type: 'identity' }, option.score, responseScores),
      responseTimeMs: answer.responseTimeMs,
      answeredAt: answer.answeredAt,
      changeCount: answer.changeCount,
    }]
  })
}

const makeScore = (
  definition: ScaleDefinitionV2,
  score: ScaleScoreDefinition,
  value: number | null,
  range: ScaleScoreRange | null,
  expectedItems: string[],
  answeredItems: string[],
  status: ScaleScoreStatus,
  prorated: boolean,
): ScaleScoreValue => ({
  key: score.key,
  type: score.type,
  label: score.label,
  description: score.description,
  direction: score.direction,
  canonical: score.canonical,
  displayPrecision: score.displayPrecision,
  value,
  range,
  expectedItems,
  answeredItems,
  status,
  prorated,
})

interface ScoreCalculation {
  value: number | null
  status: ScaleScoreStatus
  answeredItems: string[]
  prorated: boolean
}

const calculateItemScore = (
  definition: ScaleDefinitionV2,
  score: ScaleScoreDefinition,
  scoredItems: Map<string, ScoredItem>,
): ScoreCalculation => {
  if (score.source.type !== 'items') throw new Error('not an item score')
  const expectedItems = score.source.items.map((item) => item.itemCode)
  const present = score.source.items
    .map((entry) => ({ entry, scored: scoredItems.get(entry.itemCode) }))
  const answered = present.filter((entry) => entry.scored !== undefined) as Array<{ entry: { itemCode: string; weight: number }; scored: ScoredItem }>
  const policy = policyFor(definition, score)
  const missing = present.length - answered.length
  if (missing === 0) {
    return {
      value: aggregate(answered.map(({ entry, scored }) => ({ value: scored.score, weight: entry.weight })), score.source.aggregation),
      status: 'calculated',
      answeredItems: answered.map(({ entry }) => entry.itemCode),
      prorated: false,
    }
  }
  if (policy.type === 'complete_required') return { value: null, status: 'not_calculable', answeredItems: answered.map(({ entry }) => entry.itemCode), prorated: false }
  if (policy.type === 'source_defined') return { value: null, status: 'not_calculable', answeredItems: answered.map(({ entry }) => entry.itemCode), prorated: false }
  if (answered.length === 0) return { value: null, status: 'not_calculable', answeredItems: [], prorated: false }
  if (policy.type === 'prorate_if_min_answered' && answered.length < policy.minimumAnswered) {
    return { value: null, status: 'not_calculable', answeredItems: answered.map(({ entry }) => entry.itemCode), prorated: false }
  }
  const partialValue = aggregate(answered.map(({ entry, scored }) => ({ value: scored.score, weight: entry.weight })), score.source.aggregation)
  if (policy.type === 'prorate_if_min_answered') {
    const totalWeight = present.reduce((total, { entry }) => total + entry.weight, 0)
    const answeredWeight = answered.reduce((total, { entry }) => total + entry.weight, 0)
    const proratedValue = score.source.aggregation === 'mean' || score.source.aggregation === 'weighted_mean'
      ? partialValue
      : partialValue * totalWeight / answeredWeight
    return { value: finite(proratedValue), status: 'limited', answeredItems: answered.map(({ entry }) => entry.itemCode), prorated: true }
  }
  return { value: finite(partialValue), status: 'limited', answeredItems: answered.map(({ entry }) => entry.itemCode), prorated: false }
}

const calculateScore = (
  definition: ScaleDefinitionV2,
  score: ScaleScoreDefinition,
  scoredItems: Map<string, ScoredItem>,
  calculated: Map<string, ScaleScoreValue>,
  scoreRanges: Map<string, ScaleScoreRange>,
): ScoreCalculation => {
  if (score.source.type === 'items') return calculateItemScore(definition, score, scoredItems)
  const expectedItems = expectedItemsFor(definition, score)
  const sourceScores = score.source.scores
  const components = sourceScores.map((component) => calculated.get(component.scoreKey))
  const answeredItems = components
    .flatMap((component) => component?.answeredItems ?? [])
    .filter((itemCode, index, all) => all.indexOf(itemCode) === index)
  const available = components.flatMap((component, index) => {
    if (!component || component.value === null || component.status === 'not_calculable') return []
    return [{ component, entry: sourceScores[index] }]
  })
  const hasMissing = components.some((component) => !component || component.value === null || component.status !== 'calculated')
  const policy = policyFor(definition, score)
  if (!hasMissing) {
    const value = aggregate(available.map(({ component, entry }) => ({ value: component.value as number, weight: entry.weight })), score.source.aggregation)
    return {
      value,
      status: 'calculated',
      answeredItems,
      prorated: false,
    }
  }
  if (policy.type === 'complete_required' || policy.type === 'source_defined' || available.length === 0) {
    return {
      value: null,
      status: 'not_calculable',
      answeredItems,
      prorated: false,
    }
  }

  if (policy.type === 'prorate_if_min_answered' && answeredItems.length < policy.minimumAnswered) {
    return { value: null, status: 'not_calculable', answeredItems, prorated: false }
  }

  const value = aggregate(available.map(({ component, entry }) => ({ value: component.value as number, weight: entry.weight })), score.source.aggregation)
  if (policy.type === 'prorate_if_min_answered') {
    const totalWeight = sourceScores.reduce((total, component) => total + component.weight, 0)
    const answeredWeight = available.reduce((total, entry) => total + entry.entry.weight, 0)
    const proratedValue = score.source.aggregation === 'mean' || score.source.aggregation === 'weighted_mean'
      ? value
      : value * totalWeight / answeredWeight
    return { value: finite(proratedValue), status: 'limited', answeredItems, prorated: true }
  }
  return {
    value,
    status: 'limited',
    answeredItems: expectedItems.filter((itemCode) => answeredItems.includes(itemCode)),
    prorated: components.some((component) => component?.prorated === true),
  }
}

const isScaleScoreStatus = (value: unknown): value is ScaleScoreStatus => (
  value === 'calculated' || value === 'limited' || value === 'not_calculable'
)

const isQualityStatus = (value: unknown): value is ScaleQualityStatus => (
  value === 'interpretable' || value === 'limited' || value === 'invalid'
)

const validateCustomScorerOutput = (
  definition: ScaleDefinitionV2,
  output: ScaleCustomScorerOutput,
  fallbackQuality: ScaleQuality,
): ScaleScoringOutput => {
  if (!output || !Array.isArray(output.scores)) throw new Error('custom scorer 必须返回 scores 数组')

  const byKey = new Map<string, ScaleScoreValue>()
  output.scores.forEach((candidate) => {
    if (!candidate || typeof candidate.key !== 'string' || byKey.has(candidate.key)) {
      throw new Error('custom scorer 返回了重复或无效的 score key')
    }
    byKey.set(candidate.key, candidate)
  })

  const scorerScores = definition.scoring.scores.map((definitionScore) => {
    const candidate = byKey.get(definitionScore.key)
    if (!candidate) throw new Error(`custom scorer 缺少 score：${definitionScore.key}`)
    if (candidate.value !== null && (!Number.isFinite(candidate.value) || typeof candidate.value !== 'number')) {
      throw new Error(`custom scorer 的 ${definitionScore.key} value 必须是有限数字或 null`)
    }
    if (!isScaleScoreStatus(candidate.status)) throw new Error(`custom scorer 的 ${definitionScore.key} status 无效`)
    if (!Array.isArray(candidate.answeredItems) || candidate.answeredItems.some((itemCode) => typeof itemCode !== 'string')) {
      throw new Error(`custom scorer 的 ${definitionScore.key} answeredItems 无效`)
    }
    if (typeof candidate.prorated !== 'boolean') throw new Error(`custom scorer 的 ${definitionScore.key} prorated 无效`)

    const declaredRange = definitionScore.range
    if (!declaredRange) throw new Error(`custom scorer 的 ${definitionScore.key} 缺少声明范围`)
    if (!candidate.range
      || !Number.isFinite(candidate.range.min)
      || !Number.isFinite(candidate.range.max)
      || candidate.range.min !== declaredRange.min
      || candidate.range.max !== declaredRange.max) {
      throw new Error(`custom scorer 的 ${definitionScore.key} range 与 definition 不一致`)
    }

    const expectedItems = expectedItemsFor(definition, definitionScore)
    const answerSet = new Set(candidate.answeredItems)
    if (candidate.answeredItems.some((itemCode) => !expectedItems.includes(itemCode))) {
      throw new Error(`custom scorer 的 ${definitionScore.key} answeredItems 超出 score 来源`)
    }
    return makeScore(
      definition,
      definitionScore,
      candidate.value,
      declaredRange,
      expectedItems,
      expectedItems.filter((itemCode) => answerSet.has(itemCode)),
      candidate.status,
      candidate.prorated,
    )
  })

  if (byKey.size !== scorerScores.length) throw new Error('custom scorer 返回了 definition 未声明的 score')
  const canonical = scorerScores.filter((score) => score.canonical)
  const derivedStatus: ScaleQualityStatus = canonical.some((score) => score.status === 'not_calculable')
    ? 'invalid'
    : canonical.some((score) => score.status === 'limited')
      ? 'limited'
      : 'interpretable'
  const quality = output.quality ?? fallbackQuality
  if (!isQualityStatus(quality.status) || !Array.isArray(quality.flags)) throw new Error('custom scorer 返回的 quality 无效')
  const allowedFlags = new Set<ScaleQuality['flags'][number]>(['missing_items', 'insufficient_items', 'score_not_calculable'])
  if (quality.flags.some((flag) => !allowedFlags.has(flag))) throw new Error('custom scorer 返回了未知 quality flag')
  if (quality.status !== derivedStatus) throw new Error('custom scorer 的 quality status 与 canonical score 不一致')

  return { itemScores: [], scores: scorerScores, quality: { status: quality.status, flags: [...new Set(quality.flags)] } }
}

const calculateScoreRanges = (definition: ScaleDefinitionV2): Map<string, ScaleScoreRange> => {
  const ranges = itemRanges(definition)
  const scoreRanges = new Map<string, ScaleScoreRange>()
  const pending = new Set(definition.scoring.scores.map((score) => score.key))
  while (pending.size > 0) {
    let progressed = false
    definition.scoring.scores.forEach((score) => {
      if (!pending.has(score.key)) return
      if (score.source.type === 'scores' && score.source.scores.some((component) => !scoreRanges.has(component.scoreKey))) return
      scoreRanges.set(score.key, scoreRangeFor(definition, score, ranges, scoreRanges))
      pending.delete(score.key)
      progressed = true
    })
    if (!progressed) break
  }
  return scoreRanges
}

export const scoreScale = (
  definitionInput: ScaleDefinitionV2,
  inputAnswers: ScaleAnswer[] | Record<string, ScaleResponseValue>,
): ScaleScoringOutput => {
  const parsed = scaleDefinitionSchema.parse(definitionInput)
  const answers = normalizeAnswers(inputAnswers)
  const answerByItem = validateAnswers(parsed, answers)
  const scoredItems = scoreItems(parsed, answerByItem)
  const scoredItemByCode = new Map(scoredItems.map((item) => [item.itemCode, item]))
  const scoreRanges = calculateScoreRanges(parsed)
  const calculated = new Map<string, ScaleScoreValue>()
  const flags: ScaleQuality['flags'] = []
  const pending = new Set(parsed.scoring.scores.map((score) => score.key))

  while (pending.size > 0) {
    let progressed = false
    parsed.scoring.scores.forEach((score) => {
      if (!pending.has(score.key)) return
      if (score.source.type === 'scores' && score.source.scores.some((component) => !calculated.has(component.scoreKey))) return
      const expectedItems = expectedItemsFor(parsed, score)
      const calculation = calculateScore(parsed, score, scoredItemByCode, calculated, scoreRanges)
      const range = scoreRanges.get(score.key) ?? null
      const result = makeScore(parsed, score, calculation.value, range, expectedItems, calculation.answeredItems, calculation.status, calculation.prorated)
      calculated.set(score.key, result)
      pending.delete(score.key)
      progressed = true
      if (calculation.answeredItems.length < expectedItems.length) addFlag(flags, 'missing_items')
      if (calculation.status === 'not_calculable') {
        addFlag(flags, 'score_not_calculable')
        const policy = policyFor(parsed, score)
        if (policy.type === 'prorate_if_min_answered') addFlag(flags, 'insufficient_items')
      }
    })
    if (!progressed) break
  }

  parsed.scoring.scores.forEach((score) => {
    if (!calculated.has(score.key)) {
      calculated.set(score.key, makeScore(parsed, score, null, scoreRanges.get(score.key) ?? null, expectedItemsFor(parsed, score), [], 'not_calculable', false))
      addFlag(flags, 'score_not_calculable')
    }
  })

  const scores = parsed.scoring.scores.map((score) => calculated.get(score.key) as ScaleScoreValue)
  const canonicalScores = scores.filter((score) => score.canonical)
  const qualityStatus: ScaleQualityStatus = canonicalScores.some((score) => score.status === 'not_calculable')
    ? 'invalid'
    : canonicalScores.some((score) => score.status === 'limited')
      ? 'limited'
      : 'interpretable'

  if (parsed.scoring.scorerKey) {
    const scorer = customScorerRegistry.get(parsed.scoring.scorerKey)
    if (!scorer) throw new Error(`未注册的 scorerKey：${parsed.scoring.scorerKey}`)
    const custom = scorer({ definition: parsed, answers, itemScores: scoredItems })
    const validated = validateCustomScorerOutput(parsed, custom, { status: qualityStatus, flags })
    return { ...validated, itemScores: scoredItems }
  }

  return { itemScores: scoredItems, scores, quality: { status: qualityStatus, flags } }
}

/** Validate one answer before it is persisted by a runner. */
export const validateScaleAnswer = (
  definition: ScaleDefinitionV2,
  answer: ScaleAnswer,
): void => {
  validateAnswers(definition, [answer])
}
