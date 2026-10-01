import { createHash } from 'node:crypto'
import { z } from 'zod'
import { measurementBundleSchema, optionEvidenceSchema, scoringModelSchema } from './situation-scientific-contract'
import type { AssessmentAssetIdentityV1 } from '../assessment-media/assessment-asset-identity'
import {
  ASSESSMENT_STATIC_IMAGE_MIME_TYPES,
  assessmentStaticImageAssetIdentitySchema,
  assessmentStaticImageMimeTypeSchema,
  type AssessmentStaticImageAssetIdentityV1,
  type AssessmentStaticImageMimeType,
} from '../assessment-media/assessment-image'
import {
  assessmentVideoPresentationAssetReferences,
  assessmentVideoPresentationSchema,
} from '../assessment-media/assessment-video'

export type SituationalResponseValue = string | number

/**
 * Compatibility aliases keep the published Situational V1 JSON shape stable
 * while the immutable StoredAsset identity is owned by Assessment media.
 */
export const SITUATIONAL_STATIC_IMAGE_MIME_TYPES = ASSESSMENT_STATIC_IMAGE_MIME_TYPES
export const situationalStaticImageMimeTypeSchema = assessmentStaticImageMimeTypeSchema
export type SituationalStaticImageMimeType = AssessmentStaticImageMimeType

const nonBlankTextSchema = z.string().min(1).refine((value) => value.trim().length > 0, {
  message: '文本不能为空白',
})

/**
 * Image compatibility aliases remain intentionally narrow. VIDEO presentation
 * reuses the shared Assessment video identity instead of widening this alias.
 */
export const situationalStoredAssetIdentitySchema = assessmentStaticImageAssetIdentitySchema
export type SituationalStoredAssetIdentity = AssessmentStaticImageAssetIdentityV1
export type SituationalAssetReference = AssessmentAssetIdentityV1

export const situationalDirectionSchema = z.enum([
  'higher_is_better',
  'higher_is_worse',
  'higher_is_more',
  'lower_is_better',
  'bipolar',
  'descriptive',
])
export type SituationalDirection = z.infer<typeof situationalDirectionSchema>

/**
 * Stable opaque identifiers used in composite response keys. `:` is reserved
 * by the record-form response encoding (`sceneKey:channelKey`) and therefore
 * cannot appear inside scene/channel/option identities.
 */
export const situationalOpaqueKeySchema = z.string().min(1).refine(
  (value) => value.trim().length > 0 && !value.includes(':'),
  { message: '标识符不能为空白且不能包含冒号 (:)' },
)

/**
 * Psychological purpose of a channel — scientific meaning only. It never
 * influences scoring or response validation; identity is `channelKey` and the
 * response primitive is `responseType`.
 */
export const situationalPurposeSchema = z.enum([
  'BEHAVIOR_TENDENCY',
  'EMOTION',
  'APPROACH_AVOID',
  'PREFERENCE',
  'APPRAISAL',
  'NORM_JUDGMENT',
  'CONFIDENCE',
  'PROFESSIONAL_JUDGMENT', 'SELF_EFFICACY', 'ROLE_LEGITIMACY',
  'FELT_RESPONSIBILITY', 'STATE_EMOTION', 'SOCIAL_PERCEPTION',
])
export type SituationalPurpose = z.infer<typeof situationalPurposeSchema>

/**
 * Response primitive: how the participant answers and how the scorer treats
 * the raw value. Deliberately orthogonal to `purpose`.
 */
export const situationalResponseTypeSchema = z.enum(['SINGLE_CHOICE', 'CONTINUOUS'])
export type SituationalResponseType = z.infer<typeof situationalResponseTypeSchema>

/**
 * Stimulus presentation is deliberately separated from the response model and
 * scoring. IMAGE/COMIC and VIDEO are presentation-only variants. VIDEO embeds
 * the shared AssessmentVideoPresentationV1 contract, so Range delivery,
 * captions, poster identity and transcript semantics remain owned by MEDIA-4.
 * Playback state is never a response or branching surface. `text` remains
 * optional at the draft/schema layer; the publication gate requires fallback
 * text for every media scene.
 */
export const situationalStimulusSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('TEXT_V1'), text: nonBlankTextSchema }),
  z.object({
    type: z.literal('IMAGE'),
    text: nonBlankTextSchema.optional(),
    asset: situationalStoredAssetIdentitySchema,
    altText: nonBlankTextSchema,
    caption: nonBlankTextSchema.optional(),
  }).strict(),
  z.object({
    type: z.literal('COMIC'),
    text: nonBlankTextSchema.optional(),
    panels: z.array(z.object({
      assetRef: situationalStoredAssetIdentitySchema,
      altText: nonBlankTextSchema,
      caption: nonBlankTextSchema.optional(),
    }).strict()).min(1),
  }).strict(),
  z.object({
    type: z.literal('VIDEO'),
    text: nonBlankTextSchema.optional(),
    presentation: assessmentVideoPresentationSchema,
  }).strict(),
])
export type SituationalStimulus = z.infer<typeof situationalStimulusSchema>

/** Existing image endpoint remains image-only; VIDEO poster bytes use capability delivery. */
export const situationalImageAssetReferences = (stimulus: SituationalStimulus): SituationalStoredAssetIdentity[] => {
  if (stimulus.type === 'IMAGE') return [stimulus.asset]
  if (stimulus.type === 'COMIC') return stimulus.panels.map((panel) => panel.assetRef)
  return []
}

/** All immutable StoredAsset identities frozen/retained for a Situational scene. */
export const situationalAssetReferences = (stimulus: SituationalStimulus): SituationalAssetReference[] => {
  if (stimulus.type === 'VIDEO') return assessmentVideoPresentationAssetReferences(stimulus.presentation)
  return situationalImageAssetReferences(stimulus)
}

export const situationDefinitionAssetReferences = (definition: SituationDefinitionV1): SituationalAssetReference[] => (
  definition.scenes.flatMap((scene) => situationalAssetReferences(scene.stimulus))
)

const choiceOptionSchema = z.object({
  optionKey: situationalOpaqueKeySchema,
  label: z.string().min(1),
  evidence: optionEvidenceSchema.optional(),
})
export type SituationalChoiceOption = z.infer<typeof choiceOptionSchema>

/**
 * A response channel carries exactly one scored target construct.
 * - `channelKey` is the free-form identity used by raw responses, choice
 *   contributions, and published metrics;
 * - `purpose` is scientific metadata only;
 * - `responseType` decides the answer and scoring primitive.
 * Options are presented without scores (Decision A: the frozen participant
 * response is the optionKey, never a number); provisional contributions live
 * in `scoring.choiceScores` keyed by scoringVersion.
 */
export const situationalChannelSchema = z.discriminatedUnion('responseType', [
  z.object({
    channelKey: situationalOpaqueKeySchema,
    purpose: situationalPurposeSchema,
    responseType: z.literal('SINGLE_CHOICE'),
    scoredConstruct: z.string().min(1).optional(),
    prompt: z.string().min(1),
    options: z.array(choiceOptionSchema).min(2),
  }),
  z.object({
    channelKey: situationalOpaqueKeySchema,
    purpose: situationalPurposeSchema,
    responseType: z.literal('CONTINUOUS'),
    scoredConstruct: z.string().min(1).optional(),
    prompt: z.string().min(1),
    /** Explicit answer range — the scorer never assumes 0–100. */
    range: z.object({
      min: z.number().finite(),
      max: z.number().finite(),
    }),
    /** POSITIVE: higher raw → higher metric. NEGATIVE: deterministic reverse. */
    scoringDirection: z.enum(['POSITIVE', 'NEGATIVE']),
  }),
])
export type SituationalChannelDefinition = z.infer<typeof situationalChannelSchema>

/**
 * A scene is the internal measurement atom of a situational UNIT (Decision C):
 * one instrument = one UNIT = N scenes, each scene with 1–3 response channels.
 */
export const situationalSceneSchema = z.object({
  sceneKey: situationalOpaqueKeySchema,
  title: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
  stimulus: situationalStimulusSchema,
  primaryConstruct: z.string().min(1),
  /** Scientific design metadata only — never scored by the V1 scorer. */
  secondaryConstructs: z.array(z.string().min(1)).default([]),
  /** DIAMONDS-style situation coding metadata (dimension → intensity). */
  situationFeatures: z.record(z.string(), z.number().finite()).default({}),
  channels: z.array(situationalChannelSchema).min(1).max(3),
  measurementBundle: measurementBundleSchema.optional(),
})
export const situationalMeasurementSceneSchema = situationalSceneSchema.extend({ channels: z.array(situationalChannelSchema).min(1).max(6) })
export type SituationalSceneDefinition = z.infer<typeof situationalSceneSchema>

/**
 * Presentation scope for the Pilot V1 contract: every declared scene is
 * presented, fixed linear order. Matrix sampling moves to the research-scale
 * backlog and will return as an explicit, separately-designed assignment
 * contract (assignmentVersion + activeSceneKeys + provenance) — the scorer
 * must never depend on a sampling strategy it cannot honour.
 */
export const situationalSamplingSchema = z.object({
  strategy: z.literal('ALL'),
})
export type SituationalSamplingDefinition = z.infer<typeof situationalSamplingSchema>

const choiceContributionSchema = z.object({
  sceneKey: situationalOpaqueKeySchema,
  channelKey: situationalOpaqueKeySchema,
  optionKey: situationalOpaqueKeySchema,
  contribution: z.number().finite(),
})
export type SituationalChoiceContribution = z.infer<typeof choiceContributionSchema>

export const situationalMetricDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  construct: z.string().min(1),
  channelKey: situationalOpaqueKeySchema,
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
    model: scoringModelSchema.optional(),
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
  allowMeasurementBundle?: boolean
}

const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

export const validateSituationDefinition = (
  value: unknown,
  options: SituationDefinitionValidationOptions = {},
): { definition?: SituationDefinitionV1; issues: DefinitionIssue[] } => {
  const schema = options.allowMeasurementBundle ? situationDefinitionSchema.extend({ scenes: z.array(situationalMeasurementSceneSchema).min(1) }) : situationDefinitionSchema
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.') || 'definition', message: issue.message, severity: 'error' })),
    }
  }

  const definition = parsed.data
  const issues: DefinitionIssue[] = []

  const sceneKeys = new Set<string>()
  const sceneSortOrders = new Set<number>()
  definition.scenes.forEach((scene, sceneIndex) => {
    if (sceneKeys.has(scene.sceneKey)) {
      issues.push({ path: `scenes.${sceneIndex}.sceneKey`, message: '场景编码不能重复', severity: 'error' })
    }
    sceneKeys.add(scene.sceneKey)
    if (sceneSortOrders.has(scene.sortOrder)) {
      issues.push({ path: `scenes.${sceneIndex}.sortOrder`, message: `场景 sortOrder 不能重复：${scene.sortOrder}`, severity: 'error' })
    }
    sceneSortOrders.add(scene.sortOrder)
    if (scene.measurementBundle && !options.allowMeasurementBundle) issues.push({ path: `scenes.${sceneIndex}.measurementBundle`, message: 'Measurement bundles require V2', severity: 'error' })
    if (!scene.measurementBundle && scene.channels.length > 3) issues.push({ path: `scenes.${sceneIndex}.channels`, message: '超过三个响应需要 measurementBundle', severity: 'error' })
    const declaredConstructs = new Set([scene.primaryConstruct, ...scene.secondaryConstructs])
    const channelKeys = new Set<string>()
    scene.channels.forEach((channel, channelIndex) => {
      if (channelKeys.has(channel.channelKey)) {
        issues.push({ path: `scenes.${sceneIndex}.channels.${channelIndex}.channelKey`, message: '同一场景内通道不能重复', severity: 'error' })
      }
      channelKeys.add(channel.channelKey)
      if (channel.responseType === 'SINGLE_CHOICE') {
        const optionKeys = new Set<string>()
        channel.options.forEach((option, optionIndex) => {
          if (optionKeys.has(option.optionKey)) {
            issues.push({
              path: `scenes.${sceneIndex}.channels.${channelIndex}.options.${optionIndex}.optionKey`,
              message: `同一选择通道内 optionKey 不能重复：${option.optionKey}`,
              severity: 'error',
            })
          }
          optionKeys.add(option.optionKey)
        })
      }
      if (channel.responseType === 'CONTINUOUS' && channel.range.min >= channel.range.max) {
        issues.push({ path: `scenes.${sceneIndex}.channels.${channelIndex}.range`, message: 'CONTINUOUS 通道的 range.min 必须小于 range.max', severity: 'error' })
      }
      if (!channel.scoredConstruct || !declaredConstructs.has(channel.scoredConstruct)) {
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
  // every declared scene channel must feed exactly one published metric. All
  // scene channels contributing to one metric must share the same scientific
  // purpose and response primitive; continuous cells also share range and
  // direction so the cross-scene mean has one coherent scale.
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
    const backingChannels = definition.scenes.flatMap((scene) => scene.channels.filter((channel) => (
      channel.channelKey === metric.channelKey && channel.scoredConstruct === metric.construct
    )))
    if (backingChannels.length === 0) {
      issues.push({ path: `scoring.publishedMetrics.${metricIndex}`, message: `metric 没有可计分的场景通道支撑：${cellKey}`, severity: 'error' })
      return
    }
    const first = backingChannels[0]!
    backingChannels.slice(1).forEach((channel) => {
      if (channel.purpose !== first.purpose) {
        issues.push({
          path: `scoring.publishedMetrics.${metricIndex}`,
          message: `同一 metric 的通道 purpose 必须一致：${cellKey}`,
          severity: 'error',
        })
      }
      if (channel.responseType !== first.responseType) {
        issues.push({
          path: `scoring.publishedMetrics.${metricIndex}`,
          message: `同一 metric 不能混合不同 responseType：${cellKey}`,
          severity: 'error',
        })
        return
      }
      if (channel.responseType === 'CONTINUOUS' && first.responseType === 'CONTINUOUS') {
        if (channel.range.min !== first.range.min || channel.range.max !== first.range.max) {
          issues.push({
            path: `scoring.publishedMetrics.${metricIndex}`,
            message: `同一 CONTINUOUS metric 的 range 必须一致：${cellKey}`,
            severity: 'error',
          })
        }
        if (channel.scoringDirection !== first.scoringDirection) {
          issues.push({
            path: `scoring.publishedMetrics.${metricIndex}`,
            message: `同一 CONTINUOUS metric 的 scoringDirection 必须一致：${cellKey}`,
            severity: 'error',
          })
        }
      }
    })
  })
  definition.scenes.forEach((scene, sceneIndex) => {
    scene.channels.forEach((channel, channelIndex) => {
      const cellKey = `${channel.scoredConstruct}:${channel.channelKey}`
      if (!metricCells.has(cellKey)) {
        issues.push({ path: `scenes.${sceneIndex}.channels.${channelIndex}`, message: `场景通道没有对应的发布 metric：${cellKey}`, severity: 'error' })
      }
    })
  })

  const metricOrderKeys = new Set<string>()
  definition.report.metricOrder.forEach((key, index) => {
    if (metricOrderKeys.has(key)) {
      issues.push({ path: `report.metricOrder.${index}`, message: `报告 metricOrder 不能重复：${key}`, severity: 'error' })
    }
    metricOrderKeys.add(key)
    if (!metricKeys.has(key)) issues.push({ path: `report.metricOrder.${index}`, message: `报告引用了不存在的 metric：${key}`, severity: 'error' })
  })
  definition.scoring.publishedMetrics.forEach((metric) => {
    if (!definition.report.metricOrder.includes(metric.key)) {
      issues.push({ path: 'report.metricOrder', message: `报告缺少 metric：${metric.key}`, severity: 'error' })
    }
  })
  const reportPrimaryKeys = new Set<string>()
  definition.report.primaryMetricKeys.forEach((key, index) => {
    if (reportPrimaryKeys.has(key)) {
      issues.push({ path: `report.primaryMetricKeys.${index}`, message: `报告主 metric 不能重复：${key}`, severity: 'error' })
    }
    reportPrimaryKeys.add(key)
    const metric = definition.scoring.publishedMetrics.find((entry) => entry.key === key)
    if (!metric) {
      issues.push({ path: 'report.primaryMetricKeys', message: `报告主 metric 不存在：${key}`, severity: 'error' })
    } else if (metric.role !== 'primary') {
      issues.push({ path: 'report.primaryMetricKeys', message: `报告主 metric 必须声明 role=primary：${key}`, severity: 'error' })
    }
  })
  definition.scoring.publishedMetrics.forEach((metric) => {
    if (metric.role === 'primary' && !reportPrimaryKeys.has(metric.key)) {
      issues.push({ path: 'report.primaryMetricKeys', message: `role=primary 的 metric 必须进入 report.primaryMetricKeys：${metric.key}`, severity: 'error' })
    }
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
    definition.scenes.forEach((scene, sceneIndex) => {
      if (scene.stimulus.type !== 'TEXT_V1' && !hasText(scene.stimulus.text)) {
        issues.push({
          path: `scenes.${sceneIndex}.stimulus.text`,
          message: '发布的 IMAGE/COMIC/VIDEO 情境必须保留文字题面',
          severity: 'error',
        })
      }
    })
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
        : { range: channel.range }),
    })),
  })),
})