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

/** 一个注册的 Cognitive Test 实现：版本键 + 双 Zod schema + 纯函数 scorer。 */
export interface RegistryEntry<TConfig, TTrial> {
  testType: string
  engineVersion: string
  scoringVersion: string
  configSchema: ZodType<TConfig>
  trialSchema: ZodType<TTrial>
  score(input: {
    config: TConfig
    trials: ScoringTrial<TTrial>[]
  }): CognitiveScoreResult
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
