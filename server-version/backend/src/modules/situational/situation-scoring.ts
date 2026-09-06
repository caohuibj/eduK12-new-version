import {
  situationDefinitionSchema,
  type SituationalChannelKey,
  type SituationDefinitionV1,
  type SituationalResponseValue,
} from './situation-definition'

/**
 * A frozen participant response. The response value is deliberately not a
 * score: choice channels carry the optionKey, rating channels carry the raw
 * 0–100 value. Provisional contributions live in the definition's
 * `scoring.choiceScores` and are re-derivable from these immutable rows.
 */
export interface SituationalResponse {
  sceneKey: string
  channelKey: SituationalChannelKey
  responseValue: SituationalResponseValue
  responseTimeMs?: number
  answeredAt?: string
}

export type SituationalMetricStatus = 'calculated' | 'limited' | 'not_calculable'

export interface SituationalMetricValue {
  key: string
  label: string
  construct: string
  channelKey: SituationalChannelKey
  direction: SituationDefinitionV1['scoring']['publishedMetrics'][number]['direction']
  role: 'primary' | 'secondary'
  displayPrecision: number
  value: number | null
  range: { min: number; max: number } | null
  expectedResponses: string[]
  answeredResponses: string[]
  status: SituationalMetricStatus
}

export type SituationalQualityStatus = 'interpretable' | 'limited' | 'invalid'

export interface SituationalQuality {
  status: SituationalQualityStatus
  flags: Array<'missing_responses' | 'metric_not_calculable'>
}

export interface SituationalResultV1 {
  metrics: SituationalMetricValue[]
  quality: SituationalQuality
}

export interface SituationalResponseIssue {
  path: string
  message: string
}

export class SituationalResponseValidationError extends Error {
  readonly issues: SituationalResponseIssue[]

  constructor(issues: SituationalResponseIssue[]) {
    super('情境化测评回答不合法')
    this.name = 'SituationalResponseValidationError'
    this.issues = issues
  }
}

export interface SituationalGoldenCase {
  name: string
  responses: SituationalResponse[]
  expected: {
    quality: SituationalQualityStatus
    metrics: Record<string, number | null>
    metricKeys: string[]
  }
}

const finite = (value: number): number => {
  if (!Number.isFinite(value)) throw new Error('计分结果必须是有限数字')
  return value
}

const responseKey = (sceneKey: string, channelKey: SituationalChannelKey): string => `${sceneKey}:${channelKey}`

const normalizeResponses = (
  responses: SituationalResponse[] | Record<string, SituationalResponseValue>,
): SituationalResponse[] => (
  Array.isArray(responses)
    ? responses
    : Object.entries(responses).map(([key, responseValue]) => {
      const separatorIndex = key.indexOf(':')
      if (separatorIndex <= 0 || separatorIndex === key.length - 1) {
        throw new Error(`回答记录键必须是 "<sceneKey>:<channelKey>"：${key}`)
      }
      return {
        sceneKey: key.slice(0, separatorIndex),
        channelKey: key.slice(separatorIndex + 1) as SituationalChannelKey,
        responseValue,
      }
    })
)

const validateResponses = (
  definition: SituationDefinitionV1,
  responses: SituationalResponse[],
): Map<string, SituationalResponse> => {
  const issues: SituationalResponseIssue[] = []
  const pairByKey = new Map<string, { sceneKey: string; responseType: string; optionKeys: Set<string> }>()
  definition.scenes.forEach((scene) => {
    scene.channels.forEach((channel) => {
      pairByKey.set(responseKey(scene.sceneKey, channel.channelKey), {
        sceneKey: scene.sceneKey,
        responseType: channel.responseType,
        optionKeys: new Set(channel.responseType === 'SINGLE_CHOICE' ? channel.options.map((option) => option.optionKey) : []),
      })
    })
  })

  const answered = new Map<string, SituationalResponse>()
  responses.forEach((response, index) => {
    const path = `responses.${index}`
    const pairKey = responseKey(response.sceneKey, response.channelKey)
    const pair = pairByKey.get(pairKey)
    if (!pair) {
      issues.push({ path: `${path}`, message: `回答引用了不存在的场景通道：${pairKey}` })
      return
    }
    if (answered.has(pairKey)) {
      issues.push({ path: `${path}`, message: `同一场景通道重复回答：${pairKey}` })
      return
    }
    if (response.responseTimeMs !== undefined && (!Number.isFinite(response.responseTimeMs) || response.responseTimeMs < 0)) {
      issues.push({ path: `${path}.responseTimeMs`, message: 'responseTimeMs 必须是非负有限数字' })
    }
    if (response.responseTimeMs !== undefined && !Number.isInteger(response.responseTimeMs)) {
      issues.push({ path: `${path}.responseTimeMs`, message: 'responseTimeMs 必须是整数' })
    }
    if (pair.responseType === 'SINGLE_CHOICE') {
      if (typeof response.responseValue !== 'string' || !pair.optionKeys.has(response.responseValue)) {
        issues.push({ path: `${path}.responseValue`, message: `选择通道的回答必须是该通道的选项：${pairKey}` })
        return
      }
    } else if (typeof response.responseValue !== 'number' || !Number.isFinite(response.responseValue) || response.responseValue < 0 || response.responseValue > 100) {
      issues.push({ path: `${path}.responseValue`, message: `评分通道的回答必须是 0–100 的数字：${pairKey}` })
      return
    }
    answered.set(pairKey, response)
  })

  if (issues.length > 0) throw new SituationalResponseValidationError(issues)
  return answered
}

const contributionByKey = (definition: SituationDefinitionV1): Map<string, number> => {
  const output = new Map<string, number>()
  definition.scoring.choiceScores.forEach((entry) => {
    output.set(`${responseKey(entry.sceneKey, entry.channelKey)}:${entry.optionKey}`, entry.contribution)
  })
  return output
}

const expectedResponsesFor = (definition: SituationDefinitionV1, metric: SituationDefinitionV1['scoring']['publishedMetrics'][number]): string[] => (
  definition.scenes.flatMap((scene) => scene.channels
    .filter((channel) => channel.channelKey === metric.channelKey && channel.scoredConstruct === metric.construct)
    .map((channel) => responseKey(scene.sceneKey, channel.channelKey)))
)

const rangeForPair = (definition: SituationDefinitionV1, pairKey: string): { min: number; max: number } => {
  const scene = definition.scenes.find((candidate) => candidate.channels.some((channel) => responseKey(candidate.sceneKey, channel.channelKey) === pairKey))
  const channel = scene?.channels.find((candidate) => responseKey(scene.sceneKey, candidate.channelKey) === pairKey)
  if (!scene || !channel) throw new Error(`metric 期望响应不存在：${pairKey}`)
  if (channel.responseType === 'RATING_0_100') return { min: 0, max: 100 }
  const pairContributions = definition.scoring.choiceScores
    .filter((entry) => responseKey(entry.sceneKey, entry.channelKey) === pairKey)
    .map((entry) => entry.contribution)
  if (pairContributions.length === 0) throw new Error(`选择通道缺少计分贡献：${pairKey}`)
  return { min: Math.min(...pairContributions), max: Math.max(...pairContributions) }
}

const rangeFor = (definition: SituationDefinitionV1, expectedResponses: string[]): { min: number; max: number } => {
  if (expectedResponses.length === 0) return { min: 0, max: 0 }
  return expectedResponses.reduce((accumulator, pairKey) => {
    const range = rangeForPair(definition, pairKey)
    return { min: Math.min(accumulator.min, range.min), max: Math.max(accumulator.max, range.max) }
  }, { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY })
}

export const scoreSituational = (
  definitionInput: SituationDefinitionV1,
  inputResponses: SituationalResponse[] | Record<string, SituationalResponseValue>,
): SituationalResultV1 => {
  const definition = situationDefinitionSchema.parse(definitionInput)
  const responses = normalizeResponses(inputResponses)
  const answered = validateResponses(definition, responses)
  const contributions = contributionByKey(definition)

  const flags: SituationalQuality['flags'] = []
  const metrics: SituationalMetricValue[] = definition.scoring.publishedMetrics.map((metric): SituationalMetricValue => {
    const expectedResponses = expectedResponsesFor(definition, metric)
    const answeredResponses = expectedResponses.filter((pairKey) => answered.has(pairKey))
    const range = rangeFor(definition, expectedResponses)
    if (answeredResponses.length < expectedResponses.length) flags.push('missing_responses')
    if (answeredResponses.length === 0 || answeredResponses.length < expectedResponses.length) {
      flags.push('metric_not_calculable')
      return {
        key: metric.key,
        label: metric.label,
        construct: metric.construct,
        channelKey: metric.channelKey,
        direction: metric.direction,
        role: metric.role,
        displayPrecision: metric.displayPrecision,
        value: null,
        range,
        expectedResponses,
        answeredResponses,
        status: 'not_calculable' as const,
      }
    }
    const values = answeredResponses.map((pairKey) => {
      const response = answered.get(pairKey)
      if (!response) throw new Error(`metric 期望响应缺失：${pairKey}`)
      if (metric.channelKey === 'EMOTION_RATING') {
        return finite(typeof response.responseValue === 'number' ? response.responseValue : Number.NaN)
      }
      const contribution = contributions.get(`${pairKey}:${response.responseValue}`)
      if (contribution === undefined) throw new Error(`选项缺少计分贡献：${pairKey}:${String(response.responseValue)}`)
      return finite(contribution)
    })
    const value = finite(values.reduce((total, entry) => total + entry, 0) / values.length)
    return {
      key: metric.key,
      label: metric.label,
      construct: metric.construct,
      channelKey: metric.channelKey,
      direction: metric.direction,
      role: metric.role,
      displayPrecision: metric.displayPrecision,
      value,
      range,
      expectedResponses,
      answeredResponses,
      status: 'calculated' as const,
    }
  })

  const primaryMetrics = metrics.filter((metric) => metric.role === 'primary')
  const qualityStatus: SituationalQualityStatus = primaryMetrics.some((metric) => metric.status === 'not_calculable')
    ? 'invalid'
    : primaryMetrics.some((metric) => metric.status === 'limited')
      ? 'limited'
      : 'interpretable'

  return { metrics, quality: { status: qualityStatus, flags: [...new Set(flags)] } }
}

/** Validate one response before it is persisted by a runner. */
export const validateSituationalResponse = (
  definition: SituationDefinitionV1,
  response: SituationalResponse,
): void => {
  validateResponses(definition, [response])
}

/** Return expected scene-channel pairs that are absent from the submitted responses. */
export const missingRequiredSituationalResponseKeys = (
  definition: SituationDefinitionV1,
  responses: ReadonlyArray<Pick<SituationalResponse, 'sceneKey' | 'channelKey'>>,
): string[] => {
  const parsed = situationDefinitionSchema.parse(definition)
  const answered = new Set(responses.map((response) => responseKey(response.sceneKey, response.channelKey)))
  const expected: string[] = []
  parsed.scenes.forEach((scene) => {
    scene.channels.forEach((channel) => {
      const pairKey = responseKey(scene.sceneKey, channel.channelKey)
      if (!answered.has(pairKey) && !expected.includes(pairKey)) expected.push(pairKey)
    })
  })
  return expected
}
