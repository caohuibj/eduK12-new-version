/**
 * Cognitive 前端类型（Stage B v1.1 §12/§15）。
 * 与后端 `server-version/backend/src/modules/cognitive` 的响应形状对齐；
 * 只定义前端需要消费的字段，不复制敏感列（participantKey/payloadHash/密文）。
 */

export interface CognitiveAssignmentSummary {
  id: string
  courseId: string | null
  title: string
  instruction: string | null
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  opensAt: string | null
  dueAt: string | null
  maxAttempts: number
  required: boolean
  publishedAt: string | null
  course: { id: string; title: string; courseCode: string } | null
  config: {
    id: string
    testType: string
    configVersion: string
    name: string | null
    engineVersion: string
    scoringVersion: string
  }
}

export type CognitiveSessionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED' | 'INVALID'

export interface CognitiveResult {
  score: number
  metrics: Record<string, unknown>
  qualityFlags: Record<string, unknown>
}

/**
 * Runner 会话（对应后端 toRunnerPayload + COMPLETED 附加字段）。
 * config = 冻结的 config snapshot（decrypted）；randomSeed 必须 accept/retain/pass，禁止 regenerate。
 */
export interface CognitiveSession {
  sessionId: string
  assignmentId: string | null
  testType: string
  attemptNo: number
  status: CognitiveSessionStatus
  configVersion: string
  engineVersion: string
  scoringVersion: string
  config: Record<string, unknown>
  randomSeed: string
  finishedAt?: string | null
  result?: CognitiveResult | null
}

/** Fake Test 冻结 config（与后端 fake.config schema 一致）。 */
export interface FakeConfig {
  trialCount: number
  trialDurationMs: number
  allowPractice: boolean
  maxRtMs: number
}

/** Fake Test 单 trial payload（与后端 fake.trial schema 一致）。 */
export interface FakeTrialPayload {
  correct: boolean
  rtMs: number
}
