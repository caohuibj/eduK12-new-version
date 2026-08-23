import { ZodType } from 'zod'

/**
 * Cognitive 后端插件契约核心类型（D2 Registry Contract）。
 *
 * 设计原则（D2 §1.1 / §5）：
 *  - 本文件只定义领域类型，不引入 Express / Prisma / User / JWT 依赖。
 *  - Scorer 是纯函数式领域逻辑：不访问 Express、JWT、Prisma、Redis。
 *  - 版本信息（testType + engineVersion + scoringVersion）在契约中显式存在，
 *    D6 可用 frozen 版本精确回放评分，绝不回退"最新版"。
 */

/** 一个已从数据库/API envelope 拆出的试次：trialIndex + 经过 Zod 校验的 payload。 */
export interface ScoringTrial<TTrial> {
  trialIndex: number
  payload: TTrial
}

/** Scorer 的标准返回：score + metrics + qualityFlags（三者在 D6 全部加密存储）。 */
export interface CognitiveScoreResult {
  score: number
  metrics: Record<string, unknown>
  qualityFlags: Record<string, unknown>
}

export type CognitiveProfile = 'experience' | 'standard' | 'research'

export type MetricDirection =
  | 'higher_is_better'
  | 'lower_is_better'
  | 'descriptive'
  | 'signed'
  | 'target_range'

export interface MetricDefinition {
  key: string
  label: string
  shortLabel?: string
  construct: string
  description: string
  unit: 'ms' | 'ratio' | 'count' | 'd-prime' | 'level' | 'score' | 'map'
  valueType: 'number' | 'integer' | 'object' | 'array'
  direction: MetricDirection
  role: 'primary' | 'secondary' | 'quality' | 'research_only'
  precision?: number
  requiresQualityFlags?: string[]
  availableProfiles: CognitiveProfile[]
  export: { summary: boolean; label: string }
}

export interface QualityDefinition {
  key: string
  label: string
  description: string
}

export interface CognitiveProfileDefinition {
  profile: CognitiveProfile
  estimatedMinutes: [number, number]
  configPatch: Record<string, unknown>
  reportCaveats: string[]
}

export interface SingleTaskReportDefinition {
  title: string
  headlineMetric?: string
  primaryMetrics: string[]
  secondaryMetrics: string[]
  practicalTips?: string[]
  disclaimer: string
}

/** 一个注册的 Cognitive Test 实现：版本键 + 双 Zod schema + 纯函数 scorer。 */
export interface RegistryEntry<TConfig, TTrial> {
  testType: string
  name: string
  category: string
  engineVersion: string
  scoringVersion: string
  configSchema: ZodType<TConfig>
  trialSchema: ZodType<TTrial>
  score(input: {
    config: TConfig
    trials: ScoringTrial<TTrial>[]
    randomSeed?: string
  }): CognitiveScoreResult
  profileDefinitionVersion: string
  profiles: Record<CognitiveProfile, CognitiveProfileDefinition>
  metricDefinitionVersion: string
  metricDefinitions: Record<string, MetricDefinition>
  qualityDefinitionVersion: string
  qualityDefinitions: Record<string, QualityDefinition>
  reportDefinitionVersion: string
  reportDefinition: SingleTaskReportDefinition
  recommendedForCreate?: boolean
}

/**
 * 领域错误：仅用于 scorer 表达"试次数量/内容不满足该任务评分条件"。
 * 不建立大型错误码体系。
 */
export class CognitiveScoringInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CognitiveScoringInputError'
  }
}
