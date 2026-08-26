import { Prisma } from '@prisma/client'

/**
 * D6.1 — Session 行锁 helper（P0 并发修复）。
 *
 * 背景：appendTrial / completeSession / restartSession 三个状态敏感操作
 * 原先各自"读 Session → 校验 → 写"之间没有事务串行化，理论上允许：
 *   - complete 读 trials 0,1,2 评分的同时，append 把 trial 3 写进去
 *     → Session=COMPLETED 但 DB 实际有 0,1,2,3，破坏"评分数据集 == 完成时冻结数据集"。
 *   - append 读 IN_PROGRESS 后，restart 把旧 session → ABANDONED，append 随后写进旧 session。
 *
 * 修复：三个操作统一进入 DB transaction，并先对本 Session 行执行
 * `SELECT ... FOR UPDATE`（PostgreSQL 行锁，不引 Redis lock），
 * 锁内完成 校验 → 写/评分/状态迁移 → commit，杜绝交错。
 *
 * 说明：session 的 version/status 等冻结语义字段由行锁串行化后，
 * 同一 Session 的并发写操作会排队，天然满足 raw data integrity / reproducibility。
 */

/** 行锁读回的 Session 行（camelCase 映射，形状与 Prisma 模型一致）。 */
export interface LockedSessionRow {
  id: string
  userId: string | null
  participantKey: string
  participantSnapshotEncrypted: string | null
  assignmentId: string | null
  compositeAttemptId: string | null
  compositeItemId: string | null
  recoveryTokenHash: string | null
  anonymousCode: string | null
  configId: string
  testType: string
  attemptNo: number
  status: string
  startedAt: Date
  finishedAt: Date | null
  scoreEncrypted: string | null
  metricsEncrypted: string | null
  qualityFlagsEncrypted: string | null
  configVersion: string
  configSnapshotEncrypted: string
  engineVersion: string
  scoringVersion: string
  randomSeed: string
  completionKey: string | null
  createdAt: Date
  updatedAt: Date
}

interface RawSessionRow {
  id: string
  user_id: string | null
  participant_key: string
  participant_snapshot_encrypted: string | null
  assignment_id: string | null
  composite_attempt_id: string | null
  composite_item_id: string | null
  recovery_token_hash: string | null
  anonymous_code: string | null
  config_id: string
  test_type: string
  attempt_no: number
  status: string
  started_at: Date
  finished_at: Date | null
  score_encrypted: string | null
  metrics_encrypted: string | null
  quality_flags_encrypted: string | null
  config_version: string
  config_snapshot_encrypted: string
  engine_version: string
  scoring_version: string
  random_seed: string
  completion_key: string | null
  created_at: Date
  updated_at: Date
}

/**
 * 在事务内锁定并读取 Session 行。
 * - 行不存在 → 返回 null（调用方转 404）。
 * - 必须通过事务 client（tx）调用，确保 FOR UPDATE 在事务作用域内生效。
 */
export const lockSession = async (
  tx: Prisma.TransactionClient,
  sessionId: string
): Promise<LockedSessionRow | null> => {
  const rows = await tx.$queryRaw<RawSessionRow[]>(Prisma.sql`
    SELECT
      id, user_id, participant_key, participant_snapshot_encrypted, assignment_id,
      composite_attempt_id, composite_item_id, recovery_token_hash, anonymous_code,
      config_id, test_type, attempt_no, status, started_at, finished_at,
      score_encrypted, metrics_encrypted, quality_flags_encrypted, config_version,
      config_snapshot_encrypted, engine_version, scoring_version, random_seed,
      completion_key, created_at, updated_at
    FROM cognitive_sessions
    WHERE id = ${sessionId}
    FOR UPDATE
  `)
  if (!rows || rows.length === 0) return null
  const r = rows[0]
  return {
    id: r.id,
    userId: r.user_id,
    participantKey: r.participant_key,
    participantSnapshotEncrypted: r.participant_snapshot_encrypted,
    assignmentId: r.assignment_id,
    compositeAttemptId: r.composite_attempt_id,
    compositeItemId: r.composite_item_id,
    recoveryTokenHash: r.recovery_token_hash,
    anonymousCode: r.anonymous_code,
    configId: r.config_id,
    testType: r.test_type,
    attemptNo: r.attempt_no,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    scoreEncrypted: r.score_encrypted,
    metricsEncrypted: r.metrics_encrypted,
    qualityFlagsEncrypted: r.quality_flags_encrypted,
    configVersion: r.config_version,
    configSnapshotEncrypted: r.config_snapshot_encrypted,
    engineVersion: r.engine_version,
    scoringVersion: r.scoring_version,
    randomSeed: r.random_seed,
    completionKey: r.completion_key,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
