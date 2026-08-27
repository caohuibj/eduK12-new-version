import type { ScaleReferencePolicy } from '../scale/scale-definition'
import type { ScaleScoreValue } from '../scale/scale-scoring'

export type ReferenceEvidenceLevel = 'none' | 'literature_beta' | 'local_pilot' | 'local_norm' | 'validated_norm'
export type ReferenceKind = 'normative_distribution' | 'criterion_threshold' | 'descriptive_sample'
export type ReferenceProvenance = 'literature_reported' | 'literature_derived_estimate' | 'local_observed'

export interface ReferencePopulation {
  description?: string
  ageBand?: string | null
  sexScope?: string | null
  language?: string | null
  countryOrRegion?: string | null
}

export interface ReferenceSource {
  citation: string
  doi?: string
  url?: string
  publicationYear?: number
  sampleSize?: number
}

export interface ReferenceThreshold {
  key: string
  label: string
  minInclusive?: number
  maxInclusive?: number
}

export interface ReferencePercentilePoint {
  percentile: number
  score: number
}

export interface ReferenceStatistics {
  mean?: number
  sd?: number
  percentileTable?: ReferencePercentilePoint[]
  percentileInterpolation?: 'none' | 'linear'
  thresholds?: ReferenceThreshold[]
}

export interface ReferenceDerivation {
  method?: string
  assumptions?: string[]
  distributionAssumption?: 'normal' | 'unknown'
  allowEstimatedPercentile?: boolean
}

export interface AssessmentReferenceEntry {
  scoreKey: string
  referenceKind: ReferenceKind
  evidenceLevel: Exclude<ReferenceEvidenceLevel, 'none'>
  provenanceType: ReferenceProvenance
  instrumentVersion: string
  scoringVersion: string
  population: ReferencePopulation
  source: ReferenceSource
  statistics: ReferenceStatistics
  derivation?: ReferenceDerivation
  limitations?: string[]
  disclaimer?: string
}

export interface AssessmentReferenceSetDefinition {
  schemaVersion: 1
  instrumentType: 'scale' | 'cognitive'
  instrumentKey: string
  referenceVersion: string
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED'
  entries: AssessmentReferenceEntry[]
}

export interface ReferenceDefinitionIssue {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export const validateReferenceSetDefinition = (
  input: unknown,
): { definition?: AssessmentReferenceSetDefinition; issues: ReferenceDefinitionIssue[] } => {
  const issues: ReferenceDefinitionIssue[] = []
  if (!input || typeof input !== 'object') return { issues: [{ path: 'definition', message: 'reference definition 必须是对象', severity: 'error' }] }
  const value = input as Partial<AssessmentReferenceSetDefinition>
  if (value.schemaVersion !== 1) issues.push({ path: 'schemaVersion', message: 'reference schemaVersion 必须为 1', severity: 'error' })
  if (value.instrumentType !== 'scale' && value.instrumentType !== 'cognitive') issues.push({ path: 'instrumentType', message: 'instrumentType 必须为 scale 或 cognitive', severity: 'error' })
  if (typeof value.instrumentKey !== 'string' || value.instrumentKey.length === 0) issues.push({ path: 'instrumentKey', message: 'instrumentKey 不能为空', severity: 'error' })
  if (typeof value.referenceVersion !== 'string' || value.referenceVersion.length === 0) issues.push({ path: 'referenceVersion', message: 'referenceVersion 不能为空', severity: 'error' })
  if (value.status !== 'DRAFT' && value.status !== 'ACTIVE' && value.status !== 'RETIRED') issues.push({ path: 'status', message: 'status 不合法', severity: 'error' })
  if (!Array.isArray(value.entries) || value.entries.length === 0) issues.push({ path: 'entries', message: '至少需要一条 reference entry', severity: 'error' })
  const entries = Array.isArray(value.entries) ? value.entries : []
  const seen = new Set<string>()
  entries.forEach((entry, index) => {
    const path = `entries.${index}`
    if (!entry || typeof entry !== 'object') {
      issues.push({ path, message: 'entry 必须是对象', severity: 'error' })
      return
    }
    const candidate = entry as Partial<AssessmentReferenceEntry>
    const uniqueKey = `${candidate.scoreKey}:${candidate.referenceKind}`
    if (seen.has(uniqueKey)) issues.push({ path, message: '同一 reference set 中 scoreKey/referenceKind 不能重复', severity: 'error' })
    seen.add(uniqueKey)
    if (typeof candidate.scoreKey !== 'string' || candidate.scoreKey.length === 0) issues.push({ path: `${path}.scoreKey`, message: 'scoreKey 不能为空', severity: 'error' })
    if (!['normative_distribution', 'criterion_threshold', 'descriptive_sample'].includes(candidate.referenceKind ?? '')) issues.push({ path: `${path}.referenceKind`, message: 'referenceKind 不合法', severity: 'error' })
    if (!['literature_beta', 'local_pilot', 'local_norm', 'validated_norm'].includes(candidate.evidenceLevel ?? '')) issues.push({ path: `${path}.evidenceLevel`, message: 'evidenceLevel 不合法', severity: 'error' })
    if (!['literature_reported', 'literature_derived_estimate', 'local_observed'].includes(candidate.provenanceType ?? '')) issues.push({ path: `${path}.provenanceType`, message: 'provenanceType 不合法', severity: 'error' })
    if (typeof candidate.instrumentVersion !== 'string' || candidate.instrumentVersion.length === 0) issues.push({ path: `${path}.instrumentVersion`, message: 'instrumentVersion 不能为空', severity: 'error' })
    if (typeof candidate.scoringVersion !== 'string' || candidate.scoringVersion.length === 0) issues.push({ path: `${path}.scoringVersion`, message: 'scoringVersion 不能为空', severity: 'error' })
    if (!candidate.source || typeof candidate.source.citation !== 'string' || candidate.source.citation.length === 0) issues.push({ path: `${path}.source.citation`, message: '必须提供 citation', severity: 'error' })
    if (candidate.source?.publicationYear !== undefined && (!Number.isInteger(candidate.source.publicationYear) || candidate.source.publicationYear < 1800 || candidate.source.publicationYear > 2200)) {
      issues.push({ path: `${path}.source.publicationYear`, message: 'publicationYear 必须是 1800 到 2200 之间的整数', severity: 'error' })
    }
    if (candidate.source?.sampleSize !== undefined && (!Number.isInteger(candidate.source.sampleSize) || candidate.source.sampleSize <= 0)) {
      issues.push({ path: `${path}.source.sampleSize`, message: 'sampleSize 必须是正整数', severity: 'error' })
    }
    if (!candidate.population || typeof candidate.population !== 'object') {
      issues.push({ path: `${path}.population`, message: '必须提供 population 描述', severity: 'error' })
    } else {
      const population = candidate.population
      ;(['description', 'ageBand', 'sexScope', 'language', 'countryOrRegion'] as const).forEach((field) => {
        const fieldValue = population[field]
        if (fieldValue !== undefined && fieldValue !== null && typeof fieldValue !== 'string') {
          issues.push({ path: `${path}.population.${field}`, message: `${field} 必须是字符串或 null`, severity: 'error' })
        }
      })
    }
    const statistics = candidate.statistics
    if (!statistics || typeof statistics !== 'object') issues.push({ path: `${path}.statistics`, message: '必须提供 statistics', severity: 'error' })
    if (candidate.referenceKind === 'criterion_threshold') {
      if (!Array.isArray(statistics?.thresholds) || statistics.thresholds.length === 0) issues.push({ path: `${path}.statistics.thresholds`, message: 'criterion reference 必须提供 thresholds', severity: 'error' })
      validateThresholds(Array.isArray(statistics?.thresholds) ? statistics.thresholds : [], path, issues)
    }
    if (candidate.referenceKind === 'normative_distribution' && statistics && (!Array.isArray(statistics.percentileTable) || statistics.percentileTable.length === 0) && (statistics.mean === undefined || statistics.sd === undefined)) {
      issues.push({ path: `${path}.statistics`, message: 'normative reference 必须提供 mean + SD 或 percentile table', severity: 'error' })
    }
    if (statistics?.mean !== undefined && !Number.isFinite(statistics.mean)) issues.push({ path: `${path}.statistics.mean`, message: 'mean 必须是有限数字', severity: 'error' })
    if (statistics?.sd !== undefined && (!(statistics.sd > 0) || !Number.isFinite(statistics.sd))) issues.push({ path: `${path}.statistics.sd`, message: 'SD 必须是正数', severity: 'error' })
    if (statistics?.percentileInterpolation !== undefined && statistics.percentileInterpolation !== 'none' && statistics.percentileInterpolation !== 'linear') issues.push({ path: `${path}.statistics.percentileInterpolation`, message: 'percentileInterpolation 只能是 none 或 linear', severity: 'error' })
    if (statistics?.percentileTable !== undefined && !Array.isArray(statistics.percentileTable)) issues.push({ path: `${path}.statistics.percentileTable`, message: 'percentileTable 必须是数组', severity: 'error' })
    if (Array.isArray(statistics?.percentileTable)) validatePercentiles(statistics.percentileTable, path, issues, statistics.percentileInterpolation)
  })
  return issues.some((issue) => issue.severity === 'error') ? { issues } : { definition: value as AssessmentReferenceSetDefinition, issues }
}

const validateThresholds = (thresholds: ReferenceThreshold[], path: string, issues: ReferenceDefinitionIssue[]): void => {
  let previousMax: number | undefined
  let previousHasUnboundedUpper = false
  const keys = new Set<string>()
  thresholds.forEach((threshold, index) => {
    const thresholdPath = `${path}.statistics.thresholds.${index}`
    if (!threshold || typeof threshold !== 'object') {
      issues.push({ path: thresholdPath, message: 'threshold 必须是对象', severity: 'error' })
      return
    }
    if (typeof threshold.key !== 'string' || threshold.key.length === 0) issues.push({ path: `${thresholdPath}.key`, message: 'threshold key 不能为空', severity: 'error' })
    if (typeof threshold.key === 'string') {
      if (keys.has(threshold.key)) issues.push({ path: `${thresholdPath}.key`, message: 'threshold key 不能重复', severity: 'error' })
      keys.add(threshold.key)
    }
    if (typeof threshold.label !== 'string' || threshold.label.length === 0) issues.push({ path: `${thresholdPath}.label`, message: 'threshold label 不能为空', severity: 'error' })
    if (threshold.minInclusive !== undefined && !Number.isFinite(threshold.minInclusive)) issues.push({ path: `${thresholdPath}.minInclusive`, message: 'threshold 下界必须是有限数字', severity: 'error' })
    if (threshold.maxInclusive !== undefined && !Number.isFinite(threshold.maxInclusive)) issues.push({ path: `${thresholdPath}.maxInclusive`, message: 'threshold 上界必须是有限数字', severity: 'error' })
    if (threshold.minInclusive === undefined && threshold.maxInclusive === undefined) issues.push({ path: thresholdPath, message: 'threshold 至少需要一个边界', severity: 'error' })
    if (threshold.minInclusive !== undefined && threshold.maxInclusive !== undefined && threshold.minInclusive > threshold.maxInclusive) issues.push({ path: thresholdPath, message: 'threshold 下界不能大于上界', severity: 'error' })
    if (index > 0) {
      if (previousHasUnboundedUpper) {
        issues.push({ path: thresholdPath, message: '无上界 threshold 必须是最后一个区间', severity: 'error' })
      } else if (threshold.minInclusive === undefined) {
        issues.push({ path: `${thresholdPath}.minInclusive`, message: '除第一个区间外，threshold 必须提供下界并按分值顺序排列', severity: 'error' })
      } else if (previousMax !== undefined) {
      const isAdjacentIntegerRange = Number.isInteger(previousMax)
        && Number.isInteger(threshold.minInclusive)
        && threshold.minInclusive === previousMax + 1
      if (threshold.minInclusive > previousMax + Number.EPSILON && !isAdjacentIntegerRange) {
          issues.push({ path: thresholdPath, message: 'criterion threshold 存在间隙', severity: 'error' })
      } else if (threshold.minInclusive <= previousMax) {
          issues.push({ path: thresholdPath, message: 'criterion threshold 存在重叠', severity: 'error' })
        }
      }
    }
    if (threshold.maxInclusive !== undefined) previousMax = threshold.maxInclusive
    previousHasUnboundedUpper = threshold.maxInclusive === undefined
  })
}

const validatePercentiles = (
  points: ReferencePercentilePoint[],
  path: string,
  issues: ReferenceDefinitionIssue[],
  interpolation: 'none' | 'linear' | undefined,
): void => {
  let previous = -Infinity
  let previousScore = -Infinity
  points.forEach((point, index) => {
    const pointPath = `${path}.statistics.percentileTable.${index}`
    if (!point || typeof point !== 'object') {
      issues.push({ path: pointPath, message: 'percentile point 必须是对象', severity: 'error' })
      return
    }
    if (!(point.percentile >= 0 && point.percentile <= 100) || !Number.isFinite(point.percentile)) issues.push({ path: `${pointPath}.percentile`, message: 'percentile 必须在 0 到 100 之间', severity: 'error' })
    if (!Number.isFinite(point.score)) issues.push({ path: `${pointPath}.score`, message: 'percentile score 必须是有限数字', severity: 'error' })
    if (point.percentile <= previous) issues.push({ path: `${path}.statistics.percentileTable.${index}.percentile`, message: 'percentile table 必须按 percentile 严格递增', severity: 'error' })
    if (Number.isFinite(point.score) && point.score < previousScore) issues.push({ path: `${pointPath}.score`, message: 'percentile score 必须按 percentile 非递减排列', severity: 'error' })
    if (interpolation === 'linear' && Number.isFinite(point.score) && point.score === previousScore) issues.push({ path: `${pointPath}.score`, message: 'linear percentile interpolation 不允许重复 score', severity: 'error' })
    previous = point.percentile
    if (Number.isFinite(point.score)) previousScore = point.score
  })
}

export interface ReferenceContext {
  ageBand?: string | null
  sexScope?: string | null
  language?: string | null
  countryOrRegion?: string | null
}

export interface ResolvedScaleReference {
  scoreKey: string
  referenceVersion: string
  referenceKind: ReferenceKind
  evidenceLevel: Exclude<ReferenceEvidenceLevel, 'none'> | null
  status: 'available' | 'unavailable'
  unavailableReason?: 'not_requested' | 'not_found' | 'inactive' | 'version_mismatch' | 'missing_context' | 'insufficient_data'
  label: string
  value: number | null
  mean: number | null
  sd: number | null
  z: number | null
  t: number | null
  percentile: { value: number; estimated: boolean } | null
  criterionBand: { key: string; label: string; minInclusive: number | null; maxInclusive: number | null } | null
  meanDifference: number | null
  source: ReferenceSource | null
  population: ReferencePopulation | null
  instrumentVersion: string | null
  scoringVersion: string | null
  limitations: string[]
  disclaimer: string
}

const unavailable = (
  selection: { scoreKey: string; referenceVersion: string; referenceKind: ReferenceKind },
  reason: NonNullable<ResolvedScaleReference['unavailableReason']>,
  disclaimer = '当前没有可用的匹配群体参考。',
): ResolvedScaleReference => ({
  scoreKey: selection.scoreKey,
  referenceVersion: selection.referenceVersion,
  referenceKind: selection.referenceKind,
  evidenceLevel: null,
  status: 'unavailable',
  unavailableReason: reason,
  label: '参考暂不可用',
  value: null,
  mean: null,
  sd: null,
  z: null,
  t: null,
  percentile: null,
  criterionBand: null,
  meanDifference: null,
  source: null,
  population: null,
  instrumentVersion: null,
  scoringVersion: null,
  limitations: [],
  disclaimer,
})

const standardNormalCdf = (value: number): number => {
  // Abramowitz and Stegun 7.1.26; adequate for display-level percentile estimates.
  const sign = value < 0 ? -1 : 1
  const x = Math.abs(value) / Math.sqrt(2)
  const t = 1 / (1 + 0.3275911 * x)
  const polynomial = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return 0.5 * (1 + sign * polynomial)
}

const percentileFromTable = (
  value: number,
  points: ReferencePercentilePoint[],
  interpolation: 'none' | 'linear' = 'none',
): { value: number; estimated: boolean } | null => {
  if (points.length === 0) return null
  const exact = points.find((point) => point.score === value)
  if (exact) return { value: exact.percentile, estimated: false }
  if (interpolation !== 'linear') return null
  const ordered = [...points].sort((left, right) => left.score - right.score)
  if (value < ordered[0].score || value > ordered[ordered.length - 1].score) return null
  for (let index = 1; index < ordered.length; index += 1) {
    const lower = ordered[index - 1]
    const upper = ordered[index]
    if (value <= upper.score) {
      if (upper.score === lower.score) return { value: lower.percentile, estimated: true }
      const ratio = (value - lower.score) / (upper.score - lower.score)
      return { value: lower.percentile + ratio * (upper.percentile - lower.percentile), estimated: true }
    }
  }
  return null
}

const matchesContext = (population: ReferencePopulation, context: ReferenceContext): boolean => (
  (population.ageBand == null || population.ageBand === context.ageBand) &&
  (population.sexScope == null || population.sexScope === context.sexScope) &&
  (population.language == null || population.language === context.language) &&
  (population.countryOrRegion == null || population.countryOrRegion === context.countryOrRegion)
)

const criterionBandFor = (value: number, thresholds: ReferenceThreshold[]): ResolvedScaleReference['criterionBand'] => {
  const threshold = thresholds.find((candidate) => (
    (candidate.minInclusive === undefined || value >= candidate.minInclusive) &&
    (candidate.maxInclusive === undefined || value <= candidate.maxInclusive)
  ))
  return threshold
    ? {
        key: threshold.key,
        label: threshold.label,
        minInclusive: threshold.minInclusive ?? null,
        maxInclusive: threshold.maxInclusive ?? null,
      }
    : null
}

const fixedLabel = (entry: AssessmentReferenceEntry): string => (
  entry.evidenceLevel === 'literature_beta' ? '文献 Beta 参考' : entry.referenceKind === 'criterion_threshold' ? '来源定义阈值' : entry.referenceKind === 'descriptive_sample' ? '文献描述性样本' : '群体参考分布'
)

export const resolveScaleReference = (input: {
  policy: ScaleReferencePolicy
  references: AssessmentReferenceSetDefinition[]
  instrumentKey: string
  instrumentVersion: string
  scoringVersion: string
  score: ScaleScoreValue
  context?: ReferenceContext
}): ResolvedScaleReference[] => {
  if (input.policy.type === 'none') return []
  const context = input.context ?? {}
  return input.policy.selections
    .filter((selection) => selection.scoreKey === input.score.key)
    .map((selection) => {
      const set = input.references.find((candidate) => candidate.instrumentType === 'scale' && candidate.instrumentKey === input.instrumentKey && candidate.referenceVersion === selection.referenceVersion)
      if (!set) return unavailable(selection, 'not_found')
      if (set.status !== 'ACTIVE') return unavailable(selection, 'inactive', '该 reference 尚未激活，不用于结果解释。')
      const entry = set.entries.find((candidate) => candidate.scoreKey === selection.scoreKey && candidate.referenceKind === selection.referenceKind)
      if (!entry) return unavailable(selection, 'not_found')
      if (entry.instrumentVersion !== input.instrumentVersion || entry.scoringVersion !== input.scoringVersion) return unavailable(selection, 'version_mismatch', 'reference 与本次量表版本或计分版本不匹配。')
      if (!matchesContext(entry.population, context)) return unavailable(selection, 'missing_context', '该 reference 需要年龄、性别、语言或地区上下文；本次测评未提供匹配上下文。')
      if (input.score.value === null || input.score.status === 'not_calculable') return unavailable(selection, 'insufficient_data', '分数不可计算，因此隐藏 reference。')

      const value = input.score.value
      const statistics = entry.statistics
      const mean = statistics.mean ?? null
      const sd = statistics.sd ?? null
      let z: number | null = null
      let t: number | null = null
      let percentile: { value: number; estimated: boolean } | null = null
      let criterionBand: ResolvedScaleReference['criterionBand'] = null
      let meanDifference: number | null = null

      if (entry.referenceKind === 'normative_distribution') {
        if (mean !== null && sd !== null && sd > 0) {
          z = (value - mean) / sd
          t = 50 + 10 * z
        }
        percentile = percentileFromTable(value, statistics.percentileTable ?? [], statistics.percentileInterpolation)
        if (!percentile && mean !== null && sd !== null && sd > 0 && entry.derivation?.allowEstimatedPercentile && entry.derivation.distributionAssumption === 'normal') {
          percentile = { value: standardNormalCdf((value - mean) / sd) * 100, estimated: true }
        }
      } else if (entry.referenceKind === 'criterion_threshold') {
        criterionBand = criterionBandFor(value, statistics.thresholds ?? [])
      } else {
        meanDifference = mean === null ? null : value - mean
      }

      const disclaimer = entry.evidenceLevel === 'literature_beta'
        ? '文献 Beta 参考仅用于研究性、描述性比较，不代表本地正式人口常模。'
        : entry.disclaimer ?? '该参考不构成诊断或个体化医疗结论。'
      return {
        scoreKey: input.score.key,
        referenceVersion: set.referenceVersion,
        referenceKind: entry.referenceKind,
        evidenceLevel: entry.evidenceLevel,
        status: 'available' as const,
        label: fixedLabel(entry),
        value,
        mean,
        sd,
        z,
        t,
        percentile,
        criterionBand,
        meanDifference,
        source: entry.source,
        population: entry.population,
        instrumentVersion: entry.instrumentVersion,
        scoringVersion: entry.scoringVersion,
        limitations: entry.limitations ?? [],
        disclaimer,
      }
    })
}
