import { createHash } from 'node:crypto'
import { z } from 'zod'

export type ScaleResponseValue = string | number

export const scaleDirectionSchema = z.enum([
  'higher_is_better',
  'higher_is_worse',
  'higher_is_more',
  'lower_is_better',
  'bipolar',
  'descriptive',
])
export type ScaleDirection = z.infer<typeof scaleDirectionSchema>

export const scaleAggregationSchema = z.enum(['sum', 'mean', 'weighted_sum', 'weighted_mean'])
export type ScaleAggregation = z.infer<typeof scaleAggregationSchema>

export const scaleMissingPolicySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('complete_required') }),
  z.object({ type: z.literal('allow_missing_without_proration') }),
  z.object({ type: z.literal('prorate_if_min_answered'), minimumAnswered: z.number().int().positive() }),
  z.object({ type: z.literal('source_defined') }),
])
export type ScaleMissingPolicy = z.infer<typeof scaleMissingPolicySchema>

const responseValueSchema = z.union([z.string(), z.number().finite()])

export const scaleResponseOptionSchema = z.object({
  value: responseValueSchema,
  label: z.string().min(1),
  score: z.number().finite(),
})
export type ScaleResponseOption = z.infer<typeof scaleResponseOptionSchema>

export const scaleResponseSetSchema = z.object({
  key: z.string().min(1),
  options: z.array(scaleResponseOptionSchema).min(2),
})
export type ScaleResponseSet = z.infer<typeof scaleResponseSetSchema>

const transformSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('identity') }),
  z.object({ type: z.literal('reverse') }),
  z.object({ type: z.literal('map'), values: z.record(z.string(), z.number().finite()) }),
])
export type ScaleTransform = z.infer<typeof transformSchema>

export const scaleItemDefinitionSchema = z.object({
  itemCode: z.string().min(1),
  content: z.string().min(1),
  type: z.string().default('single'),
  required: z.boolean().default(true),
  sortOrder: z.number().int().nonnegative(),
  responseSetKey: z.string().min(1),
  randomizeOptions: z.boolean().default(false),
})
export type ScaleItemDefinition = z.infer<typeof scaleItemDefinitionSchema>

export const scaleItemRuleSchema = z.object({
  itemCode: z.string().min(1),
  transform: transformSchema.default({ type: 'identity' }),
})
export type ScaleItemRule = z.infer<typeof scaleItemRuleSchema>

const itemSourceSchema = z.object({
  type: z.literal('items'),
  items: z.array(z.object({ itemCode: z.string().min(1), weight: z.number().finite().positive().default(1) })).min(1),
  aggregation: scaleAggregationSchema,
})

const scoreSourceSchema = z.object({
  type: z.literal('scores'),
  scores: z.array(z.object({ scoreKey: z.string().min(1), weight: z.number().finite().positive().default(1) })).min(1),
  aggregation: scaleAggregationSchema,
})

const declaredScoreRangeSchema = z.object({
  min: z.number().finite(),
  max: z.number().finite(),
}).refine((range) => range.min <= range.max, {
  message: 'score range 的 min 不能大于 max',
})

export const scaleScoreDefinitionSchema = z.object({
  key: z.string().min(1),
  type: z.enum(['total', 'dimension']),
  label: z.string().min(1),
  description: z.string().optional(),
  direction: scaleDirectionSchema,
  canonical: z.boolean().default(false),
  displayPrecision: z.number().int().min(0).max(6).default(1),
  // Generic scorers derive this range from response mappings. A custom scorer
  // must declare it so the report can still show the instrument's real scale.
  range: declaredScoreRangeSchema.optional(),
  missingPolicy: scaleMissingPolicySchema.optional(),
  source: z.union([itemSourceSchema, scoreSourceSchema]),
})
export type ScaleScoreDefinition = z.infer<typeof scaleScoreDefinitionSchema>

const guidanceSchema = z.object({
  category: z.enum(['reflection', 'strategy', 'environment', 'support']),
  text: z.string().min(1),
})

const interpretationSchema = z.object({
  scoreKey: z.string().min(1),
  headline: z.string().min(1),
  source: z.discriminatedUnion('type', [
    z.object({ type: z.literal('score_only') }),
    z.object({ type: z.literal('reference'), referenceVersion: z.string().min(1), referenceKind: z.enum(['normative_distribution', 'criterion_threshold', 'descriptive_sample']) }),
  ]).default({ type: 'score_only' }),
  summary: z.string().min(1),
  bands: z.array(z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    summary: z.string().min(1),
    guidance: z.array(guidanceSchema).default([]),
  })).default([]),
  guidance: z.array(guidanceSchema).default([]),
})
export type ScaleInterpretationDefinition = z.infer<typeof interpretationSchema>

export const scaleReportDefinitionSchema = z.object({
  reportVersion: z.string().min(1),
  primaryScoreKeys: z.array(z.string().min(1)).min(1),
  scoreOrder: z.array(z.string().min(1)).min(1),
  interpretations: z.array(interpretationSchema).default([]),
  limitations: z.array(z.string().min(1)).default([]),
  disclaimer: z.string().min(1),
})
export type ScaleReportDefinition = z.infer<typeof scaleReportDefinitionSchema>

export const scaleReferencePolicySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({
    type: z.literal('declared'),
    selections: z.array(z.object({
      scoreKey: z.string().min(1),
      referenceVersion: z.string().min(1),
      referenceKind: z.enum(['normative_distribution', 'criterion_threshold', 'descriptive_sample']),
    })).default([]),
  }),
])
export type ScaleReferencePolicy = z.infer<typeof scaleReferencePolicySchema>

export const scaleDefinitionSchema = z.object({
  schemaVersion: z.literal(2),
  respondentType: z.string().min(1),
  source: z.object({
    title: z.string().optional(),
    citation: z.string().optional(),
    url: z.string().url().optional(),
    publicationYear: z.number().int().min(1800).max(2200).optional(),
  }),
  license: z.object({
    status: z.enum(['verified', 'authorized', 'self_authored', 'unknown']),
    redistribution: z.enum(['allowed', 'restricted', 'unknown']),
    note: z.string().optional(),
  }),
  display: z.object({
    randomizeItems: z.boolean().default(false),
  }),
  responseSets: z.array(scaleResponseSetSchema).min(1),
  items: z.array(scaleItemDefinitionSchema).min(1),
  scoring: z.object({
    scoringVersion: z.string().min(1),
    itemRules: z.array(scaleItemRuleSchema).min(1),
    defaultMissingPolicy: scaleMissingPolicySchema,
    scores: z.array(scaleScoreDefinitionSchema).min(1),
    scorerKey: z.string().optional(),
  }),
  report: scaleReportDefinitionSchema,
  referencePolicy: scaleReferencePolicySchema,
})
export type ScaleDefinitionV2 = z.infer<typeof scaleDefinitionSchema>

export interface DefinitionIssue {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export interface DefinitionValidationOptions {
  instrumentClass?: 'STANDARD' | 'CUSTOM_DESCRIPTIVE'
  forPublish?: boolean
  scorerKeys?: Set<string>
  requireGoldenFixture?: boolean
  hasGoldenFixture?: boolean
}

const sameResponseValue = (left: ScaleResponseValue, right: ScaleResponseValue): boolean => (
  typeof left === typeof right && left === right
)

const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

export const validateScaleDefinition = (
  value: unknown,
  options: DefinitionValidationOptions = {},
): { definition?: ScaleDefinitionV2; issues: DefinitionIssue[] } => {
  const parsed = scaleDefinitionSchema.safeParse(value)
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.') || 'definition', message: issue.message, severity: 'error' })),
    }
  }

  const definition = parsed.data
  const issues: DefinitionIssue[] = []
  if (options.forPublish) {
    if (definition.display.randomizeItems) {
      issues.push({ path: 'display.randomizeItems', message: 'PR25 暂不支持发布题目随机化，请关闭该选项', severity: 'error' })
    }
    definition.items.forEach((item, index) => {
      if (item.randomizeOptions) {
        issues.push({ path: `items.${index}.randomizeOptions`, message: 'PR25 暂不支持发布选项随机化，请关闭该选项', severity: 'error' })
      }
    })
  }
  const itemCodes = new Set<string>()
  const responseSetKeys = new Set<string>()
  const scoreKeys = new Set<string>()
  const responseSets = new Map<string, ScaleResponseSet>()

  definition.responseSets.forEach((set, setIndex) => {
    if (responseSetKeys.has(set.key)) issues.push({ path: `responseSets.${setIndex}.key`, message: '响应集 key 不能重复', severity: 'error' })
    responseSetKeys.add(set.key)
    responseSets.set(set.key, set)
    const values: ScaleResponseValue[] = []
    set.options.forEach((option, optionIndex) => {
      if (values.some((value) => sameResponseValue(value, option.value))) {
        issues.push({ path: `responseSets.${setIndex}.options.${optionIndex}.value`, message: '同一响应集中的 value 不能重复', severity: 'error' })
      }
      values.push(option.value)
    })
  })

  definition.items.forEach((item, itemIndex) => {
    if (itemCodes.has(item.itemCode)) issues.push({ path: `items.${itemIndex}.itemCode`, message: '题目编码不能重复', severity: 'error' })
    itemCodes.add(item.itemCode)
    if (!responseSetKeys.has(item.responseSetKey)) {
      issues.push({ path: `items.${itemIndex}.responseSetKey`, message: `响应集不存在：${item.responseSetKey}`, severity: 'error' })
    }
  })

  const ruleByItem = new Map<string, ScaleItemRule>()
  definition.scoring.itemRules.forEach((rule, ruleIndex) => {
    if (!itemCodes.has(rule.itemCode)) issues.push({ path: `scoring.itemRules.${ruleIndex}.itemCode`, message: `计分规则引用了不存在的题目：${rule.itemCode}`, severity: 'error' })
    if (ruleByItem.has(rule.itemCode)) issues.push({ path: `scoring.itemRules.${ruleIndex}.itemCode`, message: '同一题目只能有一个计分 transform', severity: 'error' })
    ruleByItem.set(rule.itemCode, rule)
  })
  definition.items.forEach((item) => {
    if (!ruleByItem.has(item.itemCode)) issues.push({ path: `scoring.itemRules`, message: `缺少题目计分规则：${item.itemCode}`, severity: 'error' })
  })

  // A map transform is deliberately explicit: every score that can be
  // produced by the item's response set must have a mapped output. This
  // prevents a definition from validating successfully and failing only when
  // a rarely-used response is selected.
  definition.scoring.itemRules.forEach((rule, ruleIndex) => {
    const transform = rule.transform
    if (transform.type !== 'map') return
    const item = definition.items.find((candidate) => candidate.itemCode === rule.itemCode)
    if (!item) return
    const responseSet = responseSets.get(item.responseSetKey)
    if (!responseSet) return
    const baseScores = new Set(responseSet.options.map((option) => String(option.score)))
    baseScores.forEach((baseScore) => {
      if (!(baseScore in transform.values)) {
        issues.push({ path: `scoring.itemRules.${ruleIndex}.transform.values`, message: `transform map 未覆盖基础分值：${baseScore}`, severity: 'error' })
      }
    })
  })

  definition.scoring.scores.forEach((score, scoreIndex) => {
    if (scoreKeys.has(score.key)) issues.push({ path: `scoring.scores.${scoreIndex}.key`, message: 'score key 不能重复', severity: 'error' })
    scoreKeys.add(score.key)
    const source = score.source
    if (source.type === 'items') {
      const sourceItems = new Set<string>()
      source.items.forEach((item) => {
        if (!itemCodes.has(item.itemCode)) issues.push({ path: `scoring.scores.${scoreIndex}.source`, message: `score 引用了不存在的题目：${item.itemCode}`, severity: 'error' })
        if (sourceItems.has(item.itemCode)) issues.push({ path: `scoring.scores.${scoreIndex}.source`, message: `score 不能重复引用题目：${item.itemCode}`, severity: 'error' })
        sourceItems.add(item.itemCode)
      })
    } else {
      const sourceScores = new Set<string>()
      source.scores.forEach((component) => {
        if (sourceScores.has(component.scoreKey)) issues.push({ path: `scoring.scores.${scoreIndex}.source`, message: `score 不能重复引用组件：${component.scoreKey}`, severity: 'error' })
        sourceScores.add(component.scoreKey)
      })
    }
  })

  const hasCustomScorer = Boolean(definition.scoring.scorerKey)
  definition.scoring.scores.forEach((score, scoreIndex) => {
    if (hasCustomScorer && !score.range) {
      issues.push({ path: `scoring.scores.${scoreIndex}.range`, message: '使用 custom scorer 时必须声明 score range', severity: 'error' })
    }
    if (!hasCustomScorer && score.range) {
      issues.push({ path: `scoring.scores.${scoreIndex}.range`, message: '通用 scorer 的 score range 必须由响应映射和聚合规则自动推导', severity: 'error' })
    }
  })
  definition.scoring.scores.forEach((score, scoreIndex) => {
    if (score.source.type === 'scores') {
      score.source.scores.forEach((component) => {
        if (!definition.scoring.scores.some((candidate) => candidate.key === component.scoreKey)) {
          issues.push({ path: `scoring.scores.${scoreIndex}.source`, message: `score 引用了不存在的 score：${component.scoreKey}`, severity: 'error' })
        }
      })
    }
  })

  const visit = (key: string, stack: Set<string>, visited: Set<string>) => {
    if (stack.has(key)) {
      issues.push({ path: 'scoring.scores', message: `score 依赖存在循环：${key}`, severity: 'error' })
      return
    }
    if (visited.has(key)) return
    const score = definition.scoring.scores.find((candidate) => candidate.key === key)
    if (!score || score.source.type !== 'scores') {
      visited.add(key)
      return
    }
    stack.add(key)
    score.source.scores.forEach((component) => visit(component.scoreKey, stack, visited))
    stack.delete(key)
    visited.add(key)
  }
  const visited = new Set<string>()
  definition.scoring.scores.forEach((score) => visit(score.key, new Set<string>(), visited))

  const canonicalScores = definition.scoring.scores.filter((score) => score.canonical)
  if (canonicalScores.length === 0) issues.push({ path: 'scoring.scores', message: '至少需要一个 canonical score', severity: 'error' })
  const reportScoreKeys = new Set(definition.report.scoreOrder)
  definition.report.scoreOrder.forEach((key, index) => {
    if (!scoreKeys.has(key)) issues.push({ path: `report.scoreOrder.${index}`, message: `报告引用了不存在的 score：${key}`, severity: 'error' })
  })
  definition.scoring.scores.forEach((score) => {
    if (!reportScoreKeys.has(score.key)) issues.push({ path: 'report.scoreOrder', message: `报告缺少 score：${score.key}`, severity: 'error' })
  })
  const interpretationKeys = new Set(definition.report.interpretations.map((interpretation) => interpretation.scoreKey))
  if (interpretationKeys.size !== definition.report.interpretations.length) issues.push({ path: 'report.interpretations', message: '同一 score 只能配置一条主解释', severity: 'error' })
  definition.scoring.scores.forEach((score) => {
    if (!interpretationKeys.has(score.key)) issues.push({ path: 'report.interpretations', message: `报告缺少 score 解释：${score.key}`, severity: 'error' })
  })
  definition.report.interpretations.forEach((interpretation, index) => {
    if (!scoreKeys.has(interpretation.scoreKey)) issues.push({ path: `report.interpretations.${index}.scoreKey`, message: `解释引用了不存在的 score：${interpretation.scoreKey}`, severity: 'error' })
    if (interpretation.source.type === 'reference' && definition.referencePolicy.type === 'none') {
      issues.push({ path: `report.interpretations.${index}.source`, message: 'reference 解释必须对应 declared referencePolicy', severity: 'error' })
    }
  })
  definition.report.primaryScoreKeys.forEach((key) => {
    if (!scoreKeys.has(key)) issues.push({ path: 'report.primaryScoreKeys', message: `报告主 score 不存在：${key}`, severity: 'error' })
  })

  if (definition.referencePolicy.type === 'declared') {
    if (definition.referencePolicy.selections.length === 0) issues.push({ path: 'referencePolicy.selections', message: 'declared referencePolicy 至少需要一条 selection', severity: 'error' })
    const selectionKeys = new Set<string>()
    definition.referencePolicy.selections.forEach((selection) => {
      if (!scoreKeys.has(selection.scoreKey)) issues.push({ path: 'referencePolicy.selections', message: `reference 选择了不存在的 score：${selection.scoreKey}`, severity: 'error' })
      const selectionKey = `${selection.scoreKey}:${selection.referenceVersion}:${selection.referenceKind}`
      if (selectionKeys.has(selectionKey)) issues.push({ path: 'referencePolicy.selections', message: 'reference selection 不能重复', severity: 'error' })
      selectionKeys.add(selectionKey)
    })
  }

  if (options.instrumentClass === 'CUSTOM_DESCRIPTIVE') {
    if (definition.referencePolicy.type !== 'none') issues.push({ path: 'referencePolicy', message: '自定义描述性量表不能配置群体参考', severity: 'error' })
    if (definition.scoring.scorerKey) issues.push({ path: 'scoring.scorerKey', message: '自定义描述性量表不能使用 custom scorer', severity: 'error' })
    if (definition.responseSets.length !== 1) issues.push({ path: 'responseSets', message: '自定义描述性量表只能使用一套共享响应选项', severity: 'error' })
    const sharedResponseSetKey = definition.responseSets[0]?.key
    definition.items.forEach((item, itemIndex) => {
      if (!item.required) issues.push({ path: `items.${itemIndex}.required`, message: '自定义描述性量表必须完整作答', severity: 'error' })
      if (sharedResponseSetKey && item.responseSetKey !== sharedResponseSetKey) issues.push({ path: `items.${itemIndex}.responseSetKey`, message: '自定义描述性量表的题目必须使用共享响应集', severity: 'error' })
    })
    definition.scoring.itemRules.forEach((rule, ruleIndex) => {
      if (rule.transform.type === 'map') issues.push({ path: `scoring.itemRules.${ruleIndex}.transform`, message: '自定义描述性量表只支持 identity 或 reverse', severity: 'error' })
    })
    if (definition.scoring.defaultMissingPolicy.type !== 'complete_required') issues.push({ path: 'scoring.defaultMissingPolicy', message: '自定义描述性量表必须使用 complete_required', severity: 'error' })
    definition.scoring.scores.forEach((score, scoreIndex) => {
      const policy = score.missingPolicy ?? definition.scoring.defaultMissingPolicy
      if (policy.type !== 'complete_required') issues.push({ path: `scoring.scores.${scoreIndex}.missingPolicy`, message: '自定义描述性量表必须使用 complete_required', severity: 'error' })
      if (score.source.type !== 'items') issues.push({ path: `scoring.scores.${scoreIndex}.source`, message: '自定义描述性量表只支持直接按题目计分', severity: 'error' })
      if (score.source.type === 'items') {
        if (score.source.aggregation !== 'sum' && score.source.aggregation !== 'mean') issues.push({ path: `scoring.scores.${scoreIndex}.source.aggregation`, message: '自定义描述性量表只支持 sum 或 mean', severity: 'error' })
        score.source.items.forEach((item, itemIndex) => {
          if (item.weight !== 1) issues.push({ path: `scoring.scores.${scoreIndex}.source.items.${itemIndex}.weight`, message: '自定义描述性量表不支持题目权重', severity: 'error' })
        })
      }
    })
    definition.report.interpretations.forEach((interpretation, interpretationIndex) => {
      if (interpretation.source.type !== 'score_only') issues.push({ path: `report.interpretations.${interpretationIndex}.source`, message: '自定义描述性量表只能使用 score_only 解释', severity: 'error' })
      if (interpretation.bands.length > 0) issues.push({ path: `report.interpretations.${interpretationIndex}.bands`, message: '自定义描述性量表不能配置 cutoff 区间', severity: 'error' })
    })
  }
  if (definition.scoring.defaultMissingPolicy.type === 'source_defined' && !definition.scoring.scorerKey) {
    issues.push({ path: 'scoring.defaultMissingPolicy', message: 'source_defined 必须配置 scorerKey', severity: 'error' })
  }
  definition.scoring.scores.forEach((score, scoreIndex) => {
    if ((score.missingPolicy ?? definition.scoring.defaultMissingPolicy).type === 'source_defined' && !definition.scoring.scorerKey) {
      issues.push({ path: `scoring.scores.${scoreIndex}.missingPolicy`, message: 'source_defined 必须配置 scorerKey', severity: 'error' })
    }
  })
  if (definition.scoring.scorerKey && options.scorerKeys && !options.scorerKeys.has(definition.scoring.scorerKey)) {
    issues.push({ path: 'scoring.scorerKey', message: `未注册的 scorerKey：${definition.scoring.scorerKey}`, severity: 'error' })
  }

  if (options.forPublish) {
    if (!hasText(definition.source.title) && !hasText(definition.source.citation)) issues.push({ path: 'source', message: '发布前必须填写来源', severity: 'error' })
    if (definition.license.status === 'unknown' || definition.license.redistribution === 'unknown') issues.push({ path: 'license', message: '发布前必须明确内容授权状态', severity: 'error' })
    if (!hasText(definition.report.disclaimer)) issues.push({ path: 'report.disclaimer', message: '发布前必须填写免责声明', severity: 'error' })
    if (options.requireGoldenFixture && !options.hasGoldenFixture) issues.push({ path: 'goldenFixture', message: '标准量表缺少 golden scoring fixture', severity: 'error' })
  }

  const referencePolicy = definition.referencePolicy
  if (referencePolicy.type === 'declared') {
    definition.report.interpretations.forEach((interpretation, interpretationIndex) => {
      const source = interpretation.source
      if (source.type !== 'reference') return
      const selected = referencePolicy.selections.some((selection) => (
        selection.scoreKey === interpretation.scoreKey
          && selection.referenceVersion === source.referenceVersion
          && selection.referenceKind === source.referenceKind
      ))
      if (!selected) {
        issues.push({ path: `report.interpretations.${interpretationIndex}.source`, message: '主解释来源必须对应 referencePolicy 中的 selection', severity: 'error' })
      }
    })
  }

  if (definition.license.status === 'self_authored') {
    issues.push({ path: 'license', message: '自有内容将按描述性自定义量表展示', severity: 'warning' })
  }

  return { definition, issues }
}

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stableValue(child)]))
  }
  return value
}

export const hashScaleDefinition = (definition: ScaleDefinitionV2): string => (
  createHash('sha256').update(JSON.stringify(stableValue(definition))).digest('hex')
)

export const createCustomScaleDefinition = (): ScaleDefinitionV2 => ({
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  source: {},
  license: { status: 'self_authored', redistribution: 'allowed' },
  display: { randomizeItems: false },
  responseSets: [{
    key: 'default',
    options: [
      { value: 'option_1', label: '选项 1', score: 1 },
      { value: 'option_2', label: '选项 2', score: 2 },
      { value: 'option_3', label: '选项 3', score: 3 },
      { value: 'option_4', label: '选项 4', score: 4 },
      { value: 'option_5', label: '选项 5', score: 5 },
    ],
  }],
  items: [],
  scoring: {
    scoringVersion: '2.0.0',
    itemRules: [],
    defaultMissingPolicy: { type: 'complete_required' },
    scores: [],
  },
  report: {
    reportVersion: 'scale-report-v2',
    primaryScoreKeys: [],
    scoreOrder: [],
    interpretations: [],
    limitations: ['这是自定义描述性量表结果，不提供人口常模或诊断结论。'],
    disclaimer: '量表结果仅反映本次作答，不构成医学诊断或人口常模。',
  },
  referencePolicy: { type: 'none' },
})

export const itemForCode = (definition: ScaleDefinitionV2, itemCode: string): ScaleItemDefinition | undefined => (
  definition.items.find((item) => item.itemCode === itemCode)
)

export const responseSetForItem = (definition: ScaleDefinitionV2, item: ScaleItemDefinition): ScaleResponseSet => {
  const responseSet = definition.responseSets.find((candidate) => candidate.key === item.responseSetKey)
  if (!responseSet) throw new Error(`响应集不存在：${item.responseSetKey}`)
  return responseSet
}

export const runnerDefinition = (definition: ScaleDefinitionV2) => ({
  schemaVersion: definition.schemaVersion,
  respondentType: definition.respondentType,
  display: definition.display,
  items: [...definition.items].sort((left, right) => left.sortOrder - right.sortOrder).map((item) => ({
    ...item,
    options: responseSetForItem(definition, item).options.map(({ value, label }) => ({ value, label })),
  })),
})
