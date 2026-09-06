import { createHash } from 'node:crypto'
import { z } from 'zod'

export type SituationalResponseValue = string | number

export const situationalDirectionSchema = z.enum([
  'higher_is_better',
  'higher_is_worse',
  'higher_is_more',
  'lower_is_better',
  'bipolar',
  'descriptive',
])
export type SituationalDirection = z.infer<typeof situationalDirectionSchema>

export const situationalChannelKeySchema = z.enum([
  'BEHAVIOR_TENDENCY',
  'SHOULD_DO',
  'APPRAISAL',
  'EMOTION_RATING',
])
export type SituationalChannelKey = z.infer<typeof situationalChannelKeySchema>

/**
 * Stimulus presentation is deliberately separated from the response model and
 * scoring: Image / Comic / Video land later as additional stimulus variants
 * without touching scoring or the response contract.
 */
export const situationalStimulusSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('TEXT_V1'), text: z.string().min(1) }),
])
export type SituationalStimulus = z.infer<typeof situationalStimulusSchema>

const choiceOptionSchema = z.object({
  optionKey: z.string().min(1),
  label: z.string().min(1),
})
export type SituationalChoiceOption = z.infer<typeof choiceOptionSchema>

/**
 * A response channel carries exactly one scored target construct. Options are
 * presented without scores (Decision A: the frozen participant response is the
 * optionKey, never a number); provisional contributions live in
 * `scoring.choiceScores` keyed by scoringVersion.
 */
export const situationalChannelSchema = z.discriminatedUnion('responseType', [
  z.object({
    channelKey: situationalChannelKeySchema,
    responseType: z.literal('SINGLE_CHOICE'),
    scoredConstruct: z.string().min(1),
    prompt: z.string().min(1),
    options: z.array(choiceOptionSchema).min(2),
  }),
  z.object({
    channelKey: situationalChannelKeySchema,
    responseType: z.literal('RATING_0_100'),
    scoredConstruct: z.string().min(1),
    prompt: z.string().min(1),
  }),
])
export type SituationalChannelDefinition = z.infer<typeof situationalChannelSchema>

/**
 * A scene is the internal measurement atom of a situational UNIT (Decision C):
 * one instrument = one UNIT = N scenes, each scene with 1–3 response channels.
 */
export const situationalSceneSchema = z.object({
  sceneKey: z.string().min(1),
  title: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
  stimulus: situationalStimulusSchema,
  primaryConstruct: z.string().min(1),
  /** Scientific design metadata only — never scored by the V1 scorer. */
  secondaryConstructs: z.array(z.string().min(1)).default([]),
  /** DIAMONDS-style situation coding metadata (dimension → intensity). */
  situationFeatures: z.record(z.string(), z.number().finite()).default({}),
  channels: z.array(situationalChannelSchema).min(1).max(3),
})
export type SituationalSceneDefinition = z.infer<typeof situationalSceneSchema>

/**
 * Matrix sampling selects the active scenes per assignment. It is frozen at
 * UNIT start as internal situational state and never touches the frozen slot
 * set (Decision C).
 */
export const situationalSamplingSchema = z.discriminatedUnion('strategy', [
  z.object({ strategy: z.literal('ALL') }),
  z.object({
    strategy: z.literal('FIXED_SCENE_SAMPLE'),
    scenesPerAssignment: z.number().int().positive(),
  }),
])
export type SituationalSamplingDefinition = z.infer<typeof situationalSamplingSchema>

const choiceContributionSchema = z.object({
  sceneKey: z.string().min(1),
  channelKey: situationalChannelKeySchema,
  optionKey: z.string().min(1),
  contribution: z.number().finite(),
})
export type SituationalChoiceContribution = z.infer<typeof choiceContributionSchema>

export const situationalMetricDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  construct: z.string().min(1),
  channelKey: situationalChannelKeySchema,
  direction: situationalDirectionSchema,
  role: z.enum(['primary', 'secondary']),
  displayPrecision: z.number().int().min(0).max(6).default(1),
})
export type SituationalMetricDefinition = z.infer<typeof situationalMetricDefinitionSchema>

const guidanceSchema = z.object({
  category: z.enum(['reflection', 'strategy', 'environment', 'support']),
  text: z.string().min(1),
})

const interpretationSchema = z.object({
  metricKey: z.string().min(1),
  headline: z.string().min(1),
  summary: z.string().min(1),
  bands: z.array(z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    summary: z.string().min(1),
    guidance: z.array(guidanceSchema).default([]),
  })).default([]),
  guidance: z.array(guidanceSchema).default([]),
})
export type SituationalInterpretationDefinition = z.infer<typeof interpretationSchema>

export const situationDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
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
  sampling: situationalSamplingSchema,
  scenes: z.array(situationalSceneSchema).min(1),
  scoring: z.object({
    scoringVersion: z.string().min(1),
    choiceScores: z.array(choiceContributionSchema).default([]),
    publishedMetrics: z.array(situationalMetricDefinitionSchema).min(1),
  }),
  report: z.object({
    reportVersion: z.string().min(1),
    primaryMetricKeys: z.array(z.string().min(1)).min(1),
    metricOrder: z.array(z.string().min(1)).min(1),
    interpretations: z.array(interpretationSchema).default([]),
    limitations: z.array(z.string().min(1)).default([]),
    disclaimer: z.string().min(1),
  }),
  referencePolicy: z.object({ type: z.literal('none') }),
})
export type SituationDefinitionV1 = z.infer<typeof situationDefinitionSchema>

export interface DefinitionIssue {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export interface SituationDefinitionValidationOptions {
  forPublish?: boolean
  requireGoldenFixture?: boolean
  hasGoldenFixture?: boolean
}

const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

export const validateSituationDefinition = (
  value: unknown,
  options: SituationDefinitionValidationOptions = {},
): { definition?: SituationDefinitionV1; issues: DefinitionIssue[] } => {
  const parsed = situationDefinitionSchema.safeParse(value)
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.') || 'definition', message: issue.message, severity: 'error' })),
    }
  }

  const definition = parsed.data
  const issues: DefinitionIssue[] = []

  const sceneKeys = new Set<string>()
  definition.scenes.forEach((scene, sceneIndex) => {
    if (sceneKeys.has(scene.sceneKey)) {
      issues.push({ path: `scenes.${sceneIndex}.sceneKey`, message: '场景编码不能重复', severity: 'error' })
    }
    sceneKeys.add(scene.sceneKey)
    const declaredConstructs = new Set([scene.primaryConstruct, ...scene.secondaryConstructs])
    const channelKeys = new Set<SituationalChannelKey>()
    scene.channels.forEach((channel, channelIndex) => {
      if (channelKeys.has(channel.channelKey)) {
        issues.push({ path: `scenes.${sceneIndex}.channels.${channelIndex}.channelKey`, message: '同一场景内通道不能重复', severity: 'error' })
      }
      channelKeys.add(channel.channelKey)
      if (!declaredConstructs.has(channel.scoredConstruct)) {
        issues.push({
          path: `scenes.${sceneIndex}.channels.${channelIndex}.scoredConstruct`,
          message: `计分构念 ${channel.scoredConstruct} 未在场景的 primary/secondary constructs 中声明`,
          severity: 'error',
        })
      }
    })
  })

  // Decision A: choice contributions are the only scoring bridge, and every
  // presented option must have exactly one declared contribution so a rarely
  // chosen option can never fall through to a runtime scoring error.
  const channelByPair = new Map<string, SituationalChannelDefinition>()
  definition.scenes.forEach((scene) => {
    scene.channels.forEach((channel) => {
      channelByPair.set(`${scene.sceneKey}:${channel.channelKey}`, channel)
    })
  })
  const contributionKeys = new Set<string>()
  definition.scoring.choiceScores.forEach((entry, entryIndex) => {
    const pairKey = `${entry.sceneKey}:${entry.channelKey}`
    const channel = channelByPair.get(pairKey)
    if (!channel) {
      issues.push({ path: `scoring.choiceScores.${entryIndex}`, message: `计分贡献引用了不存在的场景通道：${pairKey}`, severity: 'error' })
      return
    }
    if (channel.responseType !== 'SINGLE_CHOICE') {
      issues.push({ path: `scoring.choiceScores.${entryIndex}`, message: `连续评分通道不接受选项贡献：${pairKey}`, severity: 'error' })
      return
    }
    if (!channel.options.some((option) => option.optionKey === entry.optionKey)) {
      issues.push({ path: `scoring.choiceScores.${entryIndex}.optionKey`, message: `计分贡献引用了不存在的选项：${pairKey}:${entry.optionKey}`, severity: 'error' })
      return
    }
    const contributionKey = `${pairKey}:${entry.optionKey}`
    if (contributionKeys.has(contributionKey)) {
      issues.push({ path: `scoring.choiceScores.${entryIndex}`, message: `同一选项只能有一条计分贡献：${contributionKey}`, severity: 'error' })
    }
    contributionKeys.add(contributionKey)
  })
  channelByPair.forEach((channel, pairKey) => {
    if (channel.responseType !== 'SINGLE_CHOICE') return
    channel.options.forEach((option) => {
      if (!contributionKeys.has(`${pairKey}:${option.optionKey}`)) {
        issues.push({ path: 'scoring.choiceScores', message: `选项缺少计分贡献：${pairKey}:${option.optionKey}`, severity: 'error' })
      }
    })
  })

  // Decision B: every published metric is one construct × channel cell, and
  // every declared scene channel must feed exactly one published metric.
  const metricKeys = new Set<string>()
  const metricCells = new Set<string>()
  definition.scoring.publishedMetrics.forEach((metric, metricIndex) => {
    if (metricKeys.has(metric.key)) {
      issues.push({ path: `scoring.publishedMetrics.${metricIndex}.key`, message: 'metric key 不能重复', severity: 'error' })
    }
    metricKeys.add(metric.key)
    const cellKey = `${metric.construct}:${metric.channelKey}`
    if (metricCells.has(cellKey)) {
      issues.push({ path: `scoring.publishedMetrics.${metricIndex}`, message: `同一 construct × channel 只能发布一个 metric：${cellKey}`, severity: 'error' })
    }
    metricCells.add(cellKey)
    const backed = definition.scenes.some((scene) => scene.channels.some((channel) => (
      channel.channelKey === metric.channelKey && channel.scoredConstruct === metric.construct
    )))
    if (!backed) {
      issues.push({ path: `scoring.publishedMetrics.${metricIndex}`, message: `metric 没有可计分的场景通道支撑：${cellKey}`, severity: 'error' })
    }
  })
  definition.scenes.forEach((scene, sceneIndex) => {
    scene.channels.forEach((channel, channelIndex) => {
      const cellKey = `${channel.scoredConstruct}:${channel.channelKey}`
      if (!metricCells.has(cellKey)) {
        issues.push({ path: `scenes.${sceneIndex}.channels.${channelIndex}`, message: `场景通道没有对应的发布 metric：${cellKey}`, severity: 'error' })
      }
    })
  })

  if (definition.sampling.strategy === 'FIXED_SCENE_SAMPLE' && definition.sampling.scenesPerAssignment > definition.scenes.length) {
    issues.push({ path: 'sampling.scenesPerAssignment', message: '每份作答的场景数不能超过定义的场景总数', severity: 'error' })
  }

  definition.report.metricOrder.forEach((key, index) => {
    if (!metricKeys.has(key)) issues.push({ path: `report.metricOrder.${index}`, message: `报告引用了不存在的 metric：${key}`, severity: 'error' })
  })
  definition.scoring.publishedMetrics.forEach((metric) => {
    if (!definition.report.metricOrder.includes(metric.key)) {
      issues.push({ path: 'report.metricOrder', message: `报告缺少 metric：${metric.key}`, severity: 'error' })
    }
  })
  definition.report.primaryMetricKeys.forEach((key) => {
    if (!metricKeys.has(key)) issues.push({ path: 'report.primaryMetricKeys', message: `报告主 metric 不存在：${key}`, severity: 'error' })
  })
  const interpretationKeys = new Set<string>()
  definition.report.interpretations.forEach((interpretation, index) => {
    if (interpretationKeys.has(interpretation.metricKey)) {
      issues.push({ path: `report.interpretations.${index}`, message: '同一 metric 只能配置一条主解释', severity: 'error' })
    }
    interpretationKeys.add(interpretation.metricKey)
    if (!metricKeys.has(interpretation.metricKey)) {
      issues.push({ path: `report.interpretations.${index}.metricKey`, message: `解释引用了不存在的 metric：${interpretation.metricKey}`, severity: 'error' })
    }
  })
  definition.scoring.publishedMetrics.forEach((metric) => {
    if (!interpretationKeys.has(metric.key)) {
      issues.push({ path: 'report.interpretations', message: `报告缺少 metric 解释：${metric.key}`, severity: 'error' })
    }
  })

  if (options.forPublish) {
    if (!hasText(definition.source.title) && !hasText(definition.source.citation)) issues.push({ path: 'source', message: '发布前必须填写来源', severity: 'error' })
    if (definition.license.status === 'unknown' || definition.license.redistribution === 'unknown') issues.push({ path: 'license', message: '发布前必须明确内容授权状态', severity: 'error' })
    if (!hasText(definition.report.disclaimer)) issues.push({ path: 'report.disclaimer', message: '发布前必须填写免责声明', severity: 'error' })
    if (options.requireGoldenFixture && !options.hasGoldenFixture) issues.push({ path: 'goldenFixture', message: '情境化测评缺少 golden scoring fixture', severity: 'error' })
  }

  if (definition.license.status === 'self_authored') {
    issues.push({ path: 'license', message: '自有内容将按描述性自定义测评展示', severity: 'warning' })
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

export const hashSituationDefinition = (definition: SituationDefinitionV1): string => (
  createHash('sha256').update(JSON.stringify(stableValue(definition))).digest('hex')
)

/**
 * Client-facing definition slice: stimulus + response surface only. Constructs,
 * contributions, and scientific metadata never reach the runner payload.
 */
export const runnerSituationDefinition = (definition: SituationDefinitionV1) => ({
  schemaVersion: definition.schemaVersion,
  respondentType: definition.respondentType,
  sampling: definition.sampling,
  scenes: [...definition.scenes].sort((left, right) => left.sortOrder - right.sortOrder).map((scene) => ({
    sceneKey: scene.sceneKey,
    title: scene.title,
    sortOrder: scene.sortOrder,
    stimulus: scene.stimulus,
    channels: scene.channels.map((channel) => ({
      channelKey: channel.channelKey,
      responseType: channel.responseType,
      prompt: channel.prompt,
      ...(channel.responseType === 'SINGLE_CHOICE'
        ? { options: channel.options.map(({ optionKey, label }) => ({ optionKey, label })) }
        : {}),
    })),
  })),
})
