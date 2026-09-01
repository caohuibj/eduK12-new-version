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
  listedStandalone?: boolean
  reportPackageLocked?: boolean
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

export interface CognitiveReportMetricView {
  key: string
  label: string
  unit?: string
  value: unknown
  formatted: string
}

export interface CognitiveV2ReportMetricView extends CognitiveReportMetricView {
  category: string
  direction: 'higher_is_better' | 'lower_is_better' | 'target_range' | 'descriptive' | 'signed'
}

export interface CognitiveV2Report {
  title: string
  qualityState: 'interpretable' | 'limited' | 'invalid'
  conclusion: string
  headline: CognitiveV2ReportMetricView[]
  user: CognitiveV2ReportMetricView[]
  detail: CognitiveV2ReportMetricView[]
  quality: Array<{ key: string; label: string; active: boolean; effect: 'none' | 'limited' | 'invalid' }>
  method: {
    testType: string
    engineVersion: string
    scoringVersion: string
    configVersion: string
    protocolSignature: string
    profile: 'experience' | 'standard' | 'research' | null
  }
  disclaimer: string
  practicalTips: string[]
}

export interface CognitiveSingleTaskReport {
  testType: string
  profile: 'experience' | 'standard' | 'research' | null
  profileLabel: string | null
  title: string
  interpretable: boolean
  qualityState: 'interpretable' | 'insufficient'
  qualityFlags: Array<{ key: string; label: string; active: boolean }>
  headline: CognitiveReportMetricView | null
  productIndex: { label: string; value: number } | null
  showProductIndex?: boolean
  primaryMetrics: CognitiveReportMetricView[]
  secondaryMetrics: CognitiveReportMetricView[]
  caveats: string[]
  practicalTips: string[]
  method: {
    testType: string
    engineVersion: string
    scoringVersion: string
    configVersion: string
    profile: 'experience' | 'standard' | 'research' | null
  }
  disclaimer: string
  reference: CognitiveReference | null
}

export interface CognitiveResult {
  score?: number
  metrics: Record<string, unknown>
  qualityFlags: Record<string, unknown>
  quality?: { state: 'interpretable' | 'limited' | 'invalid'; flags: Record<string, boolean>; reasons: string[] }
  references?: Array<Record<string, unknown>>
  report?: CognitiveV2Report | Record<string, unknown>
  assessmentContext?: { schemaVersion: 1; snapshotHash: string } | null
  reference?: CognitiveReference
  singleTaskReport?: CognitiveSingleTaskReport | null
}

export interface CognitiveReferenceComparison {
  metricKey: string
  observed: number
  referenceMean: number
  referenceSd: number
  sdDelta: number | null
  rangeLabel: string
  meanLabel?: string
}

export interface CognitiveReference {
  mode: 'none' | 'simulated' | 'literature'
  status: 'not_requested' | 'provisional' | 'unavailable'
  available: boolean
  label: string
  version: string | null
  band: string | null
  referencePosition: number | null
  comparison?: CognitiveReferenceComparison | null
  protocolMatched?: boolean
  disclaimer: string
}

export interface CognitiveHistoryItem {
  sessionId: string
  assignmentId: string | null
  title: string
  testType: string
  attemptNo: number
  configVersion: string
  engineVersion: string
  scoringVersion: string
  finishedAt: string | null
  score: number | null
  qualityState: 'interpretable' | 'limited' | 'invalid'
}

export interface CognitiveHistoryPage {
  list: CognitiveHistoryItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasMore: boolean
}

/**
 * Runner 会话（对应后端 toRunnerPayload + COMPLETED 附加字段）。
 * config = 冻结的 config snapshot（decrypted）；randomSeed 必须 accept/retain/pass，禁止 regenerate。
 */
export interface CognitiveReportDefinition {
  title: string
  headlineMetric?: string
  primaryMetrics?: string[]
  secondaryMetrics?: string[]
  summaryMetrics?: string[]
  showProductIndex?: boolean
  practicalTips?: string[]
  disclaimer: string
}

export interface CognitiveSession {
  sessionId: string
  assignmentId: string | null
  testType: string
  attemptNo: number
  attemptEpoch?: number
  deliveryMode?: 'FINAL_ONLY' | 'LEGACY'
  definitionHash?: string | null
  contextSnapshotHash?: string | null
  status: CognitiveSessionStatus
  configVersion: string
  engineVersion: string
  scoringVersion: string
  protocolSignature?: string
  protocol?: {
    schemaVersion: 1
    key: string
    version: string
    clock: 'performance'
    randomizationAlgorithmVersion: string
    trialEnvelopeVersion: 1
    phases: Array<{ key: 'test' | 'learning' | 'delayed'; persists: boolean; required: boolean }>
    measurementCriticalConfigPaths: string[]
  }
  config: Record<string, unknown>
  randomSeed: string
  profile?: 'experience' | 'standard' | 'research' | null
  reportCaveats?: string[]
  metricDefinitions?: Record<string, { key: string; label: string; unit?: string }>
  qualityDefinitions?: Record<string, { key: string; label: string; description?: string }>
  reportDefinition?: CognitiveReportDefinition
  /** 公开匿名恢复时由服务端返回，允许跨设备继续而不猜测下一个试次。 */
  nextTrialIndex?: number
  /** 公开匿名会话的参与者编号，不包含账号身份。 */
  anonymousCode?: string | null
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

/** Reaction Test 冻结 config（与后端 reaction.config schema 一致）。 */
export interface ReactionConfig {
  totalTrials: number
  foreperiodMinMs: number
  foreperiodMaxMs: number
  timeoutMs: number
  readyDurationMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/**
 * Reaction Test 单 trial payload（与后端 reaction.trial schema 一致）。
 * 用 type alias 而非 interface：保证可赋值给 onTrialComplete 的 Record<string, unknown>。
 */
export type ReactionTrialPayload = {
  foreperiodMs: number
  rtMs: number | null
  prematureCount: number
  interrupted: boolean
  inputMode: 'pointer' | 'touch' | 'keyboard'
}

export interface MemoryConfig {
  startLength: number
  maxLength: number
  trialsPerLevel: number
  digitDisplayMs: number
  digitIntervalMs: number
  readyDurationMs: number
  inactivityGuardMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

export type MemoryTrialPayload = {
  length: number
  trialWithinLevel: 1 | 2
  sequence: number[]
  response: number[]
  responseDurationMs: number
  interrupted: boolean
}

export interface StroopConfig {
  totalTrials: number
  congruentRatio: number
  fixationMs: number
  stimulusDurationMs: number
  isiMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

export type StroopColor = 'red' | 'green' | 'blue' | 'yellow'

export type StroopTrialPayload = {
  word: '红' | '绿' | '蓝' | '黄'
  inkColor: StroopColor
  response: StroopColor | null
  rtMs: number | null
  interrupted: boolean
}
