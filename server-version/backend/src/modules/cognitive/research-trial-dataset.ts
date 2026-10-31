import { createHash } from 'node:crypto'

/**
 * COG-Intelligence Roadmap v2.0 PR4 — 逐试次研究数据集与试次质量分类。
 *
 * 规则（roadmap §五 PR4 / §六）：
 *  - 数据集为 item-level 长表：一行一试次，携带版本族与 randomSeed，
 *    使任何一行都能离线重建刺激与正确性（阶段二标定的输入格式）。
 *  - dataOrigin 固定 'real'：合成数据（仿真/开发）由独立生成器产出，
 *    绝不与本导出混流；校准样本边界由阶段二 calibrationVersion 声明。
 *  - 试次质量分类只依赖 payload observable facts 与 frozen config 阈值，
 *    不改写 payload；未完成/异常试次留痕不删除。
 *  - 参与者标识：匿名码优先；账户 ID 使用完整 ID 的域分隔摘要，
 *    未绑定任何 ID 的参与者按会话分别编码，禁止截取前八位造成碰撞。
 */

export type CognitiveTrialQualityClass = 'complete' | 'timeout' | 'interrupted' | 'rapid_guess'

export interface ResearchTrialRow {
  sessionId: string
  participantId: string
  testType: string
  engineVersion: string
  scoringVersion: string
  configVersion: string
  stimulusSetVersion: string | null
  matrixType: '2x2' | '3x3' | null
  attemptNo: number
  randomSeed: string
  trialIndex: number
  trialQuality: CognitiveTrialQualityClass
  payload: Record<string, unknown>
}

export interface ResearchTrialQualitySummary {
  rowCount: number
  completeCount: number
  timeoutCount: number
  interruptedCount: number
  rapidGuessCount: number
  completeRate: number | null
  interruptedRate: number | null
  timeoutRate: number | null
  rapidGuessRate: number | null
}

export interface ResearchTrialDataset {
  schemaVersion: 1
  dataOrigin: 'real'
  generatedAtUtc: string
  rowCount: number
  sessionCount: number
  identities: Array<{ testType: string; engineVersion: string; scoringVersion: string; configVersion: string; rows: number }>
  qualitySummary: ResearchTrialQualitySummary
  rows: ResearchTrialRow[]
}

export interface ResearchTrialSessionInput {
  id: string
  userId: string | null
  anonymousCode: string | null
  attemptNo: number
  testType: string
  engineVersion: string
  scoringVersion: string
  configVersion: string
  stimulusSetVersion?: string | null
  matrixType?: '2x2' | '3x3' | null
  randomSeed: string
  /** 有效 RT 下限来自该会话解密的 frozen config snapshot；缺失时 null（不判 rapid_guess）。 */
  validRtFloorMs: number | null
  trials: Array<{ trialIndex: number; payload: unknown }>
}

// Stable pseudonyms, not full anonymization; the research export is access controlled.
const scopedPseudonym = (prefix: 'U' | 'S', identity: string): string =>
  prefix + createHash('sha256').update(`cognitive-research-v2:${prefix}:${identity}`).digest('hex').slice(0, 32)

export const researchParticipantId = (
  session: Pick<ResearchTrialSessionInput, 'id' | 'anonymousCode' | 'userId'>,
  anonymize: boolean,
): string => session.anonymousCode
  ?? (session.userId
    ? (anonymize ? scopedPseudonym('U', session.userId) : session.userId)
    : scopedPseudonym('S', session.id))

/** 试次质量分类：只读 observable facts；阈值来自 frozen config（无则不判 rapid_guess）。 */
export const classifyTrialQuality = (
  payload: Record<string, unknown>,
  validRtFloorMs: number | null,
): CognitiveTrialQualityClass => {
  if (payload.interrupted === true) return 'interrupted'
  if (payload.timedOut === true) return 'timeout'
  const responseAbsent = (() => {
    if ('responseIndex' in payload) return payload.responseIndex === null
    if ('responded' in payload) return payload.responded === false
    if ('response' in payload) return payload.response === null
    return false
  })()
  if (responseAbsent) return 'timeout'
  const rt = payload.rtMs
  if (validRtFloorMs !== null && typeof rt === 'number' && Number.isFinite(rt) && rt < validRtFloorMs) {
    return 'rapid_guess'
  }
  return 'complete'
}

const round4 = (value: number): number => Number(value.toFixed(4))

export const summarizeTrialQuality = (rows: ResearchTrialRow[]): ResearchTrialQualitySummary => {
  const total = rows.length
  const count = (quality: CognitiveTrialQualityClass) => rows.filter((row) => row.trialQuality === quality).length
  const completeCount = count('complete')
  const timeoutCount = count('timeout')
  const interruptedCount = count('interrupted')
  const rapidGuessCount = count('rapid_guess')
  const rate = (n: number) => (total > 0 ? round4(n / total) : null)
  return {
    rowCount: total,
    completeCount,
    timeoutCount,
    interruptedCount,
    rapidGuessCount,
    completeRate: rate(completeCount),
    timeoutRate: rate(timeoutCount),
    interruptedRate: rate(interruptedCount),
    rapidGuessRate: rate(rapidGuessCount),
  }
}

/** Read immutable bank identity from the session's frozen config. */
export const extractFrozenResearchBankFacts = (snapshot: unknown): {
  stimulusSetVersion: string | null
  matrixType: '2x2' | '3x3' | null
} => {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { stimulusSetVersion: null, matrixType: null }
  }
  const frozen = snapshot as Record<string, unknown>
  return {
    stimulusSetVersion: typeof frozen.stimulusSetVersion === 'string' ? frozen.stimulusSetVersion : null,
    matrixType: frozen.matrixType === '2x2' || frozen.matrixType === '3x3' ? frozen.matrixType : null,
  }
}

/** 从解密后的 config snapshot 提取有效 RT 下限（任务间字段同名约定；缺失则 null）。 */
export const extractValidRtFloorMs = (configSnapshot: unknown): number | null => {
  if (configSnapshot === null || typeof configSnapshot !== 'object') return null
  const value = (configSnapshot as Record<string, unknown>).validRtFloorMs
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export const buildResearchTrialDataset = (
  sessions: ResearchTrialSessionInput[],
  options: { anonymize?: boolean; generatedAtUtc?: string } = {},
): ResearchTrialDataset => {
  const anonymize = options.anonymize ?? true
  const rows: ResearchTrialRow[] = []
  const identityCounts = new Map<string, { testType: string; engineVersion: string; scoringVersion: string; configVersion: string; rows: number }>()
  for (const session of sessions) {
    const participantId = researchParticipantId(session, anonymize)
    for (const trial of [...session.trials].sort((a, b) => a.trialIndex - b.trialIndex)) {
      const payload = (trial.payload ?? {}) as Record<string, unknown>
      rows.push({
        sessionId: session.id,
        participantId,
        testType: session.testType,
        engineVersion: session.engineVersion,
        scoringVersion: session.scoringVersion,
        configVersion: session.configVersion,
        stimulusSetVersion: session.stimulusSetVersion ?? null,
        matrixType: session.matrixType ?? null,
        attemptNo: session.attemptNo,
        randomSeed: session.randomSeed,
        trialIndex: trial.trialIndex,
        trialQuality: classifyTrialQuality(payload, session.validRtFloorMs),
        payload,
      })
      const identityKey = `${session.testType}/${session.engineVersion}/${session.scoringVersion}/${session.configVersion}`
      const bucket = identityCounts.get(identityKey)
        ?? { testType: session.testType, engineVersion: session.engineVersion, scoringVersion: session.scoringVersion, configVersion: session.configVersion, rows: 0 }
      bucket.rows += 1
      identityCounts.set(identityKey, bucket)
    }
  }
  return {
    schemaVersion: 1,
    dataOrigin: 'real',
    generatedAtUtc: options.generatedAtUtc ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    rowCount: rows.length,
    sessionCount: sessions.length,
    identities: [...identityCounts.values()].sort((a, b) => `${a.testType}/${a.engineVersion}`.localeCompare(`${b.testType}/${b.engineVersion}`)),
    qualitySummary: summarizeTrialQuality(rows),
    rows,
  }
}
