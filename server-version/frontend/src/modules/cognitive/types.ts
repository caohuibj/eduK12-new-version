import type {
  AssessmentImagePresentationItem,
  AssessmentVideoPresentationV1,
} from '../assessment-media/types'

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
  usedAttempts?: number
  remainingAttempts?: number
  admissionPaused?: boolean
  continueHref?: string | null
  latestCompletedSessionId?: string | null
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
  presentationVersion?: string
  participantLabel?: string
  explanation?: string
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
  schemaVersion?: 2
  reading?: CognitiveReportReading
  profileLabel?: string | null
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

export interface CognitiveReportReading {
  schemaVersion: 2
  reportVersion: string
  presentationVersion: string
  title: string
  introduction: string
  illustration?: 'signal' | 'sequence' | 'stop' | 'rules'
  interpretation: { state: 'available' | 'qualified' | 'withheld'; reasons: string[]; withheldMetricKeys: string[] }
  feedback: { summary: string; evidenceMetricKeys: string[]; nextStep: string }
  caveats: string[]
  methodCaveats?: string[]
  popular?: {
    conceptTitle: string; concept: string; takeaway: string; exampleTitle: string; example: string
    scene: 'signal' | 'sequence' | 'stop' | 'rules'
    frames: Array<{ title: string; text: string }>
    boundary: string
    metricHelp: Record<string, { label: string; explanation: string }>
  }
  professional?: {
    construct: string; procedure: string; interpretation: string; confounders: string[]
    parameters: Array<{ label: string; value: string }>
    metrics: Array<{ key: string; label: string; formatted: string; unit: string; definition: string; readingHint: string }>
    quality: Array<{ key: string; label: string; active: boolean; description: string; effect: string }>
    withheld: Array<{ key: string; label: string; reasons: string[] }>
  }
  visuals: Array<{
    kind: 'reaction_trials' | 'memory_lengths' | 'metrics'
    title: string
    unit: string
    points: Array<{ label: string; value: number | null; status?: 'recorded' | 'missing' }>
    caption: string
  }>
}

export interface CognitiveSingleTaskReport {
  testType: string
  profile: 'experience' | 'standard' | 'research' | null
  profileLabel: string | null
  title: string
  interpretable: boolean
  qualityState: 'interpretable' | 'insufficient' | 'limited' | 'invalid'
  qualityFlags: Array<{ key: string; label: string; active: boolean }>
  interpretationSummary?: string | null
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
  source?: 'standalone' | 'composition'
  sourceName?: string | null
  reportHref?: string
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
  qualityState: 'interpretable' | 'limited' | 'invalid' | null
  feedbackDeferred?: boolean
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

export interface CognitivePresentationDefinitionV1 {
  schemaVersion: 1
  /** MEDIA-3 image slots remain backward compatible. */
  instruction?: AssessmentImagePresentationItem[]
  example?: AssessmentImagePresentationItem[]
  stimulus?: AssessmentImagePresentationItem[]
  /** MEDIA-7 non-timing-critical video slots; task code owns when example/stimulus are shown. */
  videos?: {
    instruction?: AssessmentVideoPresentationV1[]
    example?: AssessmentVideoPresentationV1[]
    stimulus?: AssessmentVideoPresentationV1[]
  }
}

export interface CognitiveSession {
  trainingPersistence?: import('../../training/training-cognitive-retention').TrainingPersistenceDescriptor
  sessionEpoch?: number
  feedbackDeferred?: boolean
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
  presentation?: CognitivePresentationDefinitionV1
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

/** Numberline 冻结 config（与后端 numberline.config schema 一致）。 */
export interface NumberlineConfig {
  totalTrials: number
  lineMax: number
  maxResponseMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Numberline 单 trial payload（与后端 numberline.trial schema 一致）。 */
export type NumberlineTrialPayload = {
  targetNumber: number
  responsePosition: number | null
  rtMs: number | null
  interrupted: boolean
}

/** Arithverify 冻结 config（与后端 arithverify.config schema 一致）。 */
export interface ArithverifyConfig {
  totalTrials: number
  operandMax: number
  trueRatio: number
  fixationMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Arithverify 单 trial payload（与后端 arithverify.trial schema 一致）。 */
export type ArithverifyTrialPayload = {
  leftOperand: number
  rightOperand: number
  displayedResult: number
  response: boolean | null
  rtMs: number | null
  interrupted: boolean
}

/** Sizecongruity 冻结 config（与后端 sizecongruity.config schema 一致）。 */
export interface SizecongruityConfig {
  totalTrials: number
  congruentRatio: number
  minDigit: number
  maxDigit: number
  minGap: number
  fontLargeRem: number
  fontSmallRem: number
  fixationMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Sizecongruity 单 trial payload（与后端 sizecongruity.trial schema 一致）。 */
export type SizecongruityTrialPayload = {
  leftDigit: number
  rightDigit: number
  leftFontScale: 'large' | 'small'
  rightFontScale: 'large' | 'small'
  response: 'left' | 'right' | null
  rtMs: number | null
  interrupted: boolean
}

/** Delaydiscount 冻结 config（与后端 delaydiscount.config schema 一致）。 */
export interface DelaydiscountConfig {
  delayBands: number[]
  delayedAmount: number
  bisectionSteps: number
  fixationMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Delaydiscount 单 trial payload（与后端 delaydiscount.trial schema 一致）。 */
export type DelaydiscountTrialPayload = {
  delayDays: number
  delayedAmount: number
  immediateAmount: number
  choice: 'now' | 'later' | null
  rtMs: number | null
  interrupted: boolean
}

/** Gamblingdeck 冻结 config（与后端 gamblingdeck.config schema 一致）。 */
export interface GamblingdeckConfig {
  totalTrials: number
  blockSize: number
  fixationMs: number
  feedbackMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Gamblingdeck 单 trial payload（与后端 gamblingdeck.trial schema 一致）。 */
export type GamblingdeckTrialPayload = {
  deck: 'A' | 'B' | 'C' | 'D'
  rtMs: number | null
  interrupted: boolean
}

export type GamblingdeckDeck = GamblingdeckTrialPayload['deck']

/** Symbolmatch 冻结 config（与后端 symbolmatch.config schema 一致）。 */
export interface SymbolmatchConfig {
  totalTrials: number
  symbolDigitMap: Array<[string, number]>
  fixationMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Symbolmatch 单 trial payload（与后端 symbolmatch.trial schema 一致）。 */
export type SymbolmatchTrialPayload = {
  symbol: string
  response: number | null
  rtMs: number | null
  interrupted: boolean
}

/** Runningspan 冻结 config（与后端 runningspan.config schema 一致）。 */
export interface RunningspanConfig {
  totalTrials: number
  listLengthMin: number
  listLengthMax: number
  recallLength: number
  stimulusMs: number
  isiMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Runningspan 单 trial payload（与后端 runningspan.trial schema 一致）。 */
export type RunningspanTrialPayload = {
  sequence: string[]
  response: string[]
  responseDurationMs: number
  interrupted: boolean
}

/** Sentencecheck 冻结 config（与后端 sentencecheck.config schema 一致）。 */
export interface SentencecheckConfig {
  totalTrials: number
  trueRatio: number
  negationRatio: number
  fixationMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Sentencecheck 单 trial payload（与后端 sentencecheck.trial schema 一致）。 */
export type SentencecheckTrialPayload = {
  shape: 'circle' | 'square' | 'triangle'
  color: 'red' | 'blue' | 'green' | 'yellow'
  questionKind: 'shape' | 'color'
  negated: boolean
  askedValue: string
  response: boolean | null
  rtMs: number | null
  interrupted: boolean
}

/** Lineangle 冻结 config（与后端 lineangle.config schema 一致）。 */
export interface LineangleConfig {
  totalTrials: number
  angleStepDeg: number
  optionCount: number
  minAngleSepSteps: number
  fixationMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Lineangle 单 trial payload（与后端 lineangle.trial schema 一致）。 */
export type LineangleTrialPayload = {
  targetAngle: number
  optionAngles: number[]
  responseAngle: number | null
  rtMs: number | null
  interrupted: boolean
}

/** Seqlearn 冻结 config（与后端 seqlearn.config schema 一致）。 */
export interface SeqlearnConfig {
  totalTrials: number
  trialsPerBlock: number
  patternSequence: number[]
  randomBlockIndices: number[]
  fixationMs: number
  stimulusMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Seqlearn 单 trial payload（与后端 seqlearn.trial schema 一致）。 */
export type SeqlearnTrialPayload = {
  position: number
  response: number | null
  rtMs: number | null
  interrupted: boolean
}

/** Timecopy 冻结 config（与后端 timecopy.config schema 一致）。 */
export interface TimecopyConfig {
  totalTrials: number
  targetMinMs: number
  targetMaxMs: number
  maxResponseMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Timecopy 单 trial payload（与后端 timecopy.trial schema 一致）。 */
export type TimecopyTrialPayload = {
  targetMs: number
  responseMs: number
  interrupted: boolean
}

/** Sharegame 冻结 config（与后端 sharegame.config schema 一致）。 */
export interface SharegameConfig {
  endowments: number[]
  fixationMs: number
  timeoutMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Sharegame 单 trial payload（与后端 sharegame.trial schema 一致）。 */
export type SharegameTrialPayload = {
  endowment: number
  given: number
  rtMs: number | null
  interrupted: boolean
}

/** Letternumseries 冻结 config（与后端 letternumseries.config schema 一致）。 */
export interface LetternumseriesConfig {
  totalTrials: number
  lettersPerTrial: number
  digitsPerTrial: number
  stimulusMs: number
  isiMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Letternumseries 单 trial payload（与后端 letternumseries.trial schema 一致）。 */
export type LetternumseriesTrialPayload = {
  sequence: string[]
  lettersResponse: string[]
  digitsResponse: string[]
  responseDurationMs: number
  interrupted: boolean
}

/** Wordanalogy 冻结 config（与后端 wordanalogy.config schema 一致）。 */
export interface WordanalogyConfig {
  totalTrials: number
  stimulusSetVersion: string
  fixationMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Wordanalogy 单 trial payload（与后端 wordanalogy.trial schema 一致）。 */
export type WordanalogyTrialPayload = {
  itemId: string
  responseIndex: number | null
  rtMs: number | null
  interrupted: boolean
}

/** Wordmeaning 冻结 config（与后端 wordmeaning.config schema 一致）。 */
export interface WordmeaningConfig {
  totalTrials: number
  stimulusSetVersion: string
  fixationMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Wordmeaning 单 trial payload（与后端 wordmeaning.trial schema 一致）。 */
export type WordmeaningTrialPayload = {
  itemId: string
  responseIndex: number | null
  rtMs: number | null
  interrupted: boolean
}

/** Semanticfluency 冻结 config（与后端 semanticfluency.config schema 一致）。 */
export interface SemanticfluencyConfig {
  totalTrials: number
  durationMs: number
  stimulusSetVersion: string
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Semanticfluency 单 trial payload（与后端 semanticfluency.trial schema 一致）。 */
export type SemanticfluencyTrialPayload = {
  category: 'animals' | 'fruits'
  responses: string[]
  responseDurationMs: number
  interrupted: boolean
}

/** Wordproblem 冻结 config（与后端 wordproblem.config schema 一致）。 */
export interface WordproblemConfig {
  totalTrials: number
  stimulusSetVersion: string
  fixationMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Wordproblem 单 trial payload（与后端 wordproblem.trial schema 一致）。 */
export type WordproblemTrialPayload = {
  itemId: string
  responseIndex: number | null
  rtMs: number | null
  interrupted: boolean
}

/** Icarmatrix 冻结 config（与后端 icarmatrix.config schema 一致）。 */
export interface IcarmatrixConfig {
  totalTrials: number
  stimulusSetVersion: string
  fixationMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Icarmatrix 单 trial payload（与后端 icarmatrix.trial schema 一致）。 */
export type IcarmatrixTrialPayload = {
  itemIndex: number
  responseIndex: number | null
  rtMs: number | null
  interrupted: boolean
}

/** Cancellation 冻结 config（与后端 cancellation.config schema 一致）。 */
export interface CancellationConfig {
  totalTrials: number
  durationMs: number
  stimulusSetVersion: string
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Cancellation 单 trial payload（与后端 cancellation.trial schema 一致）。 */
export type CancellationTrialPayload = {
  scanIndex: number
  selectedCells: number[]
  responseDurationMs: number
  interrupted: boolean
}

/** Trustgame 冻结 config（与后端 trustgame.config schema 一致）。 */
export interface TrustgameConfig {
  offers: number[]
  potTotal: number
  fixationMs: number
  timeoutMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Trustgame 单 trial payload（与后端 trustgame.trial schema 一致）。 */
export type TrustgameTrialPayload = {
  roundIndex: number
  offerToSelf: number
  response: 'accept' | 'reject' | null
  rtMs: number | null
  interrupted: boolean
}

/** Embeddedfigures 冻结 config（与后端 embeddedfigures.config schema 一致）。 */
export interface EmbeddedfiguresConfig {
  totalTrials: number
  stimulusSetVersion: string
  showTargetMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Embeddedfigures 单 trial payload（与后端 embeddedfigures.trial schema 一致）。 */
export type EmbeddedfiguresTrialPayload = {
  itemIndex: number
  clickedShapeId: string | null
  rtMs: number | null
  interrupted: boolean
}

/** Ufov 冻结 config（与后端 ufov.config schema 一致）。 */
export interface UfovConfig {
  totalTrials: number
  stimulusMs: number
  fixationMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Ufov 单 trial payload（与后端 ufov.trial schema 一致）。 */
export type UfovTrialPayload = {
  centralTarget: 'circle' | 'triangle'
  peripheralPosition: number
  centralResponse: number | null
  peripheralResponse: number | null
  rtMs: number | null
  interrupted: boolean
}

/** Logicdeduce 冻结 config（与后端 logicdeduce.config schema 一致）。 */
export interface LogicdeduceConfig {
  totalTrials: number
  stimulusSetVersion: string
  fixationMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Logicdeduce 单 trial payload（与后端 logicdeduce.trial schema 一致）。 */
export type LogicdeduceTrialPayload = {
  itemId: string
  responseIndex: number | null
  rtMs: number | null
  interrupted: boolean
}

/** Seriescomplete 冻结 config（与后端 seriescomplete.config schema 一致）。 */
export interface SeriescompleteConfig {
  totalTrials: number
  stimulusSetVersion: string
  fixationMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Seriescomplete 单 trial payload（与后端 seriescomplete.trial schema 一致）。 */
export type SeriescompleteTrialPayload = {
  itemId: string
  responseIndex: number | null
  rtMs: number | null
  interrupted: boolean
}

/** Pursuitrotor 冻结 config（与后端 pursuitrotor.config schema 一致）。 */
export interface PursuitrotorConfig {
  totalTrials: number
  trackMs: number
  revolutionMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Pursuitrotor 单 trial payload（与后端 pursuitrotor.trial schema 一致）。 */
export type PursuitrotorTrialPayload = {
  trialIndex: number
  timeOnTargetMs: number
  totalTrackMs: number
  interrupted: boolean
}

/** Readingcomp 冻结 config（与后端 readingcomp.config schema 一致）。 */
export interface ReadingcompConfig {
  totalTrials: number
  stimulusSetVersion: string
  fixationMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Readingcomp 单 trial payload（与后端 readingcomp.trial schema 一致）。 */
export type ReadingcompTrialPayload = {
  itemId: string
  responseIndex: number | null
  rtMs: number | null
  interrupted: boolean
}

/** Proofread 冻结 config（与后端 proofread.config schema 一致）。 */
export interface ProofreadConfig {
  totalTrials: number
  stimulusSetVersion: string
  fixationMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Proofread 单 trial payload（与后端 proofread.trial schema 一致）。 */
export type ProofreadTrialPayload = {
  itemId: string
  responseIndex: number | null
  rtMs: number | null
  interrupted: boolean
}

/** Visualwm 冻结 config（与后端 visualwm.config schema 一致）。 */
export interface VisualwmConfig {
  totalTrials: number
  studyMs: number
  retentionMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

/** Visualwm 单 trial payload（与后端 visualwm.trial schema 一致）。 */
export type VisualwmTrialPayload = {
  setSize: number
  isChange: boolean
  response: 'same' | 'change' | null
  rtMs: number | null
  interrupted: boolean
}
