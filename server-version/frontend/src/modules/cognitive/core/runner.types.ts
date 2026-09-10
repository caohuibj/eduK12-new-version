import type { CognitivePresentationDefinitionV1, CognitiveResult, CognitiveSession } from '../types'

/**
 * Runner 核心类型（Stage B v1.1 §16/§20/§22）。
 */

/** 传给 Task Runner 的冻结上下文（全部来自 Session response，不得由前端派生）。 */
export interface CognitiveTaskContext {
  sessionId: string
  testType: string
  engineVersion: string
  scoringVersion: string
  configVersion: string
  attemptNo: number
  /** 冻结 config snapshot（decrypted，来自 Session response）。 */
  config: Record<string, unknown>
  /** Static media identity is frozen with the Cognitive runtime; task code owns timing. */
  presentation?: CognitivePresentationDefinitionV1
  /** randomSeed 必须 accept/retain/pass into task context，禁止 regenerate（v1.1 §22）。 */
  randomSeed: string
}

/** Task Runner 组件契约：渲染当前 trial，提交 raw trial payload。 */
export interface CognitiveTaskProps {
  taskContext: CognitiveTaskContext
  /** Preloaded immutable image ObjectURLs keyed by frozen assetId. */
  imageAssetUrls?: Readonly<Record<string, string>>
  /** 当前应渲染的试次（0-based）。 */
  trialIndex: number
  /** 提交单笔 raw trial；前端不得提交 score/payloadHash/加密内容。 */
  onTrialComplete: (payload: Record<string, unknown>) => Promise<void | boolean>
  /** 自适应任务在完成自己的终止条件后调用；固定总数任务可不使用。 */
  onTaskComplete?: () => Promise<void>
}

export type RunnerStatus =
  | 'LOADING'
  | 'READY'
  | 'RUNNING'
  | 'SUBMITTING_TRIAL'
  | 'COMPLETING'
  | 'COMPLETED'
  | 'LEGACY_READ_ONLY'
  | 'UNSUPPORTED'
  | 'ERROR'
  | 'RECOVERY_REQUIRED'

export interface RunnerError {
  code: string
  message: string
}

export interface RunnerState {
  status: RunnerStatus
  session: CognitiveSession | null
  taskContext: CognitiveTaskContext | null
  /** 下一个要跑的 index（0-based）。 */
  trialIndex: number
  error: RunnerError | null
  result: CognitiveResult | null
}
