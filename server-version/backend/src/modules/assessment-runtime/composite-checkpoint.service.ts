import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from './canonical'
import { decryptCompactField, encryptCompactField } from './compact-field-codec'
import {
  compositeAttemptCheckpointEnvelopeSchema,
  HEX64_RE,
  lockedCheckpointUnitSchema,
  type CompositeAttemptCheckpointEnvelopeV1,
  type LockedCheckpointUnitV1,
} from './composite-final.contract'

/** Bounded plaintext size (512 KiB) accommodates drafts + locked cognitive trial envelopes. */
const MAX_CHECKPOINT_PLAIN_BYTES = 512 * 1024
const MAX_DRAFT_NODES = 15_000
const MAX_DRAFT_BYTES = 96 * 1024
const DEFAULT_CHECKPOINT_TTL_MS = 24 * 60 * 60 * 1000

export class CompositeCheckpointError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'CompositeCheckpointError'
  }
}

export type CompositeCheckpointDb = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>

interface StoredCheckpointRow {
  attemptId: string
  attemptEpoch: number
  publicationHash: string
  revision: number
  saveCount: number
  lockedSlotKeys: string[]
  payloadCipher: string
  payloadHash: string
  expiresAt: Date
  updatedAt: Date
}

export interface CompositeCheckpointSnapshot {
  revision: number
  saveCount: number
  lockedSlotKeys: string[]
  expiresAt: Date | null
  updatedAt: Date | null
  envelope: CompositeAttemptCheckpointEnvelopeV1 | null
}

export interface SaveCompositeCheckpointInput {
  attemptId: string
  attemptEpoch: number
  publicationHash: string
  expectedRevision: number
  drafts: Record<string, Record<string, unknown>>
  itemTimings?: Record<string, Record<string, unknown>>
  /** Optional unit completion to lock monotonically (Cognitive or SJT). Once locked,
   * the slot cannot be removed or overwritten within the same attempt epoch. */
  lockUnit?: {
    slotKey: string
    unit:
      | Omit<Extract<LockedCheckpointUnitV1, { unitType: 'COGNITIVE' }>, 'payloadHash' | 'lockedAt'>
      | Omit<Extract<LockedCheckpointUnitV1, { unitType: 'SITUATIONAL' }>, 'payloadHash' | 'lockedAt'>
  }
  /** Optional allowlist of slotKeys valid in this frozen publication. */
  allowedSlotKeys?: ReadonlySet<string>
  /** When true, locks the parent composite_assessment_attempts row FOR UPDATE and enforces
   * status === 'IN_PROGRESS', matching epoch, and matching publicationHash to serialize with
   * concurrent FINAL commits and checkpoint deletes. */
  verifyAttemptActive?: boolean
  expiresAt?: Date
  now?: Date
}

export interface DeleteCompositeCheckpointInput {
  attemptId: string
  attemptEpoch: number
  publicationHash: string
  expectedRevision?: number
  verifyAttemptActive?: boolean
}

async function lockAndAssertActiveAttempt(
  db: CompositeCheckpointDb,
  input: { attemptId: string; attemptEpoch: number; publicationHash: string },
): Promise<void> {
  const rows = await db.$queryRaw<Array<{
    status: string
    attemptEpoch: number
    publicationHash: string | null
  }>>(Prisma.sql`
    SELECT status::text AS status,
      attempt_epoch AS "attemptEpoch",
      publication_hash AS "publicationHash"
    FROM composite_assessment_attempts
    WHERE id = ${input.attemptId}
    FOR UPDATE
  `)
  const parent = rows[0]
  if (!parent || parent.attemptEpoch !== input.attemptEpoch || parent.publicationHash !== input.publicationHash) {
    throw new CompositeCheckpointError(409, 'CHECKPOINT_IDENTITY_MISMATCH', '草稿与当前作答版本不一致')
  }
  if (parent.status !== 'IN_PROGRESS') {
    throw new CompositeCheckpointError(409, 'CHECKPOINT_ATTEMPT_NOT_ACTIVE', '作答已结束，无法修改或清空草稿')
  }
}

function assertDraftBounds(value: unknown, depth = 0, budget = { nodes: 0, bytes: 0 }): void {
  if (++budget.nodes > MAX_DRAFT_NODES) {
    throw new CompositeCheckpointError(413, 'CHECKPOINT_TOO_LARGE', '草稿数据节点过多')
  }
  if (typeof value === 'string') {
    budget.bytes += Buffer.byteLength(value, 'utf8')
  }
  if (budget.bytes > MAX_DRAFT_BYTES) {
    throw new CompositeCheckpointError(413, 'CHECKPOINT_TOO_LARGE', '草稿内容超过限额')
  }
  if (depth > 8) {
    throw new CompositeCheckpointError(400, 'CHECKPOINT_INVALID', '草稿嵌套过深')
  }
  if (value != null && !['string', 'number', 'boolean', 'object'].includes(typeof value)) {
    throw new CompositeCheckpointError(400, 'CHECKPOINT_INVALID', '草稿内容必须为合法 JSON')
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new CompositeCheckpointError(400, 'CHECKPOINT_INVALID', '草稿数值无效')
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length > 1000) {
      throw new CompositeCheckpointError(400, 'CHECKPOINT_INVALID', '草稿字段过多')
    }
    for (const [k, child] of entries) {
      if (k === '__proto__' || k === 'prototype' || k === 'constructor') {
        throw new CompositeCheckpointError(400, 'CHECKPOINT_INVALID', '草稿字段名无效')
      }
      budget.bytes += Buffer.byteLength(k, 'utf8')
      assertDraftBounds(child, depth + 1, budget)
    }
  }
}

function decodeStoredEnvelope(row: StoredCheckpointRow): CompositeAttemptCheckpointEnvelopeV1 {
  const raw = decryptCompactField<unknown>(row.payloadCipher, MAX_CHECKPOINT_PLAIN_BYTES)
  const envelope = compositeAttemptCheckpointEnvelopeSchema.parse(raw)
  if (canonicalHash(envelope) !== row.payloadHash || envelope.publicationHash !== row.publicationHash) {
    throw new CompositeCheckpointError(409, 'CHECKPOINT_INTEGRITY_MISMATCH', '草稿密文或冻结发布摘要不一致')
  }
  const actualLocked = Object.keys(envelope.lockedUnits).sort()
  const columnLocked = [...row.lockedSlotKeys].sort()
  if (actualLocked.length !== columnLocked.length || actualLocked.some((k, i) => k !== columnLocked[i])) {
    throw new CompositeCheckpointError(409, 'CHECKPOINT_LOCK_MISMATCH', '草稿锁定槽位索引不一致')
  }
  return envelope
}

async function loadCheckpointRow(
  db: CompositeCheckpointDb,
  attemptId: string,
  forUpdate: boolean,
): Promise<StoredCheckpointRow | null> {
  const rows = await db.$queryRaw<StoredCheckpointRow[]>(Prisma.sql`
    SELECT attempt_id AS "attemptId",
      attempt_epoch AS "attemptEpoch",
      publication_hash AS "publicationHash",
      revision,
      save_count AS "saveCount",
      locked_slot_keys AS "lockedSlotKeys",
      payload_cipher AS "payloadCipher",
      payload_hash AS "payloadHash",
      expires_at AS "expiresAt",
      updated_at AS "updatedAt"
    FROM composite_attempt_checkpoints
    WHERE attempt_id = ${attemptId}
    ${forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty}
  `)
  return rows[0] ?? null
}

/** Reads an active composite checkpoint. Auto-deletes expired checkpoints. */
export async function readCompositeCheckpoint(
  db: CompositeCheckpointDb = prisma,
  input: {
    attemptId: string
    attemptEpoch: number
    publicationHash: string
    now?: Date
  },
): Promise<CompositeCheckpointSnapshot> {
  if (!HEX64_RE.test(input.publicationHash)) {
    throw new CompositeCheckpointError(400, 'CHECKPOINT_INVALID', '无效的发布快照摘要')
  }
  const now = input.now ?? new Date()
  const row = await loadCheckpointRow(db, input.attemptId, false)
  if (!row) {
    return { revision: 0, saveCount: 0, lockedSlotKeys: [], expiresAt: null, updatedAt: null, envelope: null }
  }
  if (row.attemptEpoch < input.attemptEpoch) {
    await db.$executeRaw(Prisma.sql`
      DELETE FROM composite_attempt_checkpoints
      WHERE attempt_id = ${input.attemptId} AND attempt_epoch < ${input.attemptEpoch}
    `)
    return { revision: 0, saveCount: 0, lockedSlotKeys: [], expiresAt: null, updatedAt: null, envelope: null }
  }
  if (row.attemptEpoch !== input.attemptEpoch || row.publicationHash !== input.publicationHash) {
    throw new CompositeCheckpointError(409, 'CHECKPOINT_IDENTITY_MISMATCH', '草稿与当前作答版本不一致')
  }
  if (row.expiresAt <= now) {
    if (row.lockedSlotKeys.length === 0) {
      await db.$executeRaw(Prisma.sql`
        DELETE FROM composite_attempt_checkpoints
        WHERE attempt_id = ${input.attemptId}
          AND attempt_epoch = ${row.attemptEpoch}
          AND revision = ${row.revision}
          AND cardinality(locked_slot_keys) = 0
      `)
      return { revision: 0, saveCount: 0, lockedSlotKeys: [], expiresAt: null, updatedAt: null, envelope: null }
    }
    // Preserve monotonically locked Cognitive/SJT units even if draft TTL elapsed; expire only drafts.
    const envelope = decodeStoredEnvelope(row)
    return {
      revision: row.revision,
      saveCount: row.saveCount,
      lockedSlotKeys: [...row.lockedSlotKeys],
      expiresAt: row.expiresAt,
      updatedAt: row.updatedAt,
      envelope: {
        schemaVersion: 1,
        publicationHash: envelope.publicationHash,
        drafts: {},
        lockedUnits: envelope.lockedUnits,
      },
    }
  }
  const envelope = decodeStoredEnvelope(row)
  return {
    revision: row.revision,
    saveCount: row.saveCount,
    lockedSlotKeys: [...row.lockedSlotKeys],
    expiresAt: row.expiresAt,
    updatedAt: row.updatedAt,
    envelope,
  }
}

/** Saves draft answers and optionally locks a completed Cognitive/SJT unit monotonically.
 * Caller must authorize attempt ownership and hold a transaction (or row lock on parent attempt). */
export async function saveCompositeCheckpoint(
  db: CompositeCheckpointDb,
  input: SaveCompositeCheckpointInput,
): Promise<CompositeCheckpointSnapshot> {
  if (!HEX64_RE.test(input.publicationHash)) {
    throw new CompositeCheckpointError(400, 'CHECKPOINT_INVALID', '无效的发布快照摘要')
  }
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new CompositeCheckpointError(400, 'CHECKPOINT_INVALID', '无效的草稿版本号')
  }
  assertDraftBounds(input.drafts)
  if (input.itemTimings !== undefined) assertDraftBounds(input.itemTimings)

  if (input.allowedSlotKeys) {
    for (const slotKey of Object.keys(input.drafts)) {
      if (!input.allowedSlotKeys.has(slotKey)) {
        throw new CompositeCheckpointError(400, 'CHECKPOINT_UNKNOWN_SLOT', `草稿包含未知槽位: ${slotKey}`)
      }
    }
    if (input.lockUnit && !input.allowedSlotKeys.has(input.lockUnit.slotKey)) {
      throw new CompositeCheckpointError(400, 'CHECKPOINT_UNKNOWN_SLOT', `锁定单元包含未知槽位: ${input.lockUnit.slotKey}`)
    }
  }

  if (input.verifyAttemptActive) {
    await lockAndAssertActiveAttempt(db, {
      attemptId: input.attemptId,
      attemptEpoch: input.attemptEpoch,
      publicationHash: input.publicationHash,
    })
  }

  const now = input.now ?? new Date()
  const expiresAt = input.expiresAt ?? new Date(now.getTime() + DEFAULT_CHECKPOINT_TTL_MS)
  let existing = await loadCheckpointRow(db, input.attemptId, true)

  // Drop unlocked expired rows or stale-epoch rows before CAS so INSERT starts cleanly at revision 1.
  if (existing && (existing.attemptEpoch < input.attemptEpoch || (existing.expiresAt <= now && existing.lockedSlotKeys.length === 0))) {
    const deleted = await db.$executeRaw(Prisma.sql`
      DELETE FROM composite_attempt_checkpoints
      WHERE attempt_id = ${input.attemptId}
        AND attempt_epoch = ${existing.attemptEpoch}
        AND revision = ${existing.revision}
        AND (attempt_epoch < ${input.attemptEpoch} OR cardinality(locked_slot_keys) = 0)
    `)
    if (deleted > 0) existing = null
  }
  if (existing && (existing.attemptEpoch !== input.attemptEpoch || existing.publicationHash !== input.publicationHash)) {
    throw new CompositeCheckpointError(409, 'CHECKPOINT_IDENTITY_MISMATCH', '草稿与当前作答版本不一致')
  }

  const currentRevision = existing ? existing.revision : 0

  if (currentRevision !== input.expectedRevision) {
    throw new CompositeCheckpointError(
      409,
      'CHECKPOINT_CONFLICT',
      `草稿版本冲突（预期 ${input.expectedRevision}，当前 ${currentRevision}）`,
    )
  }

  const mergedLocked: Record<string, LockedCheckpointUnitV1> = existing
    ? { ...decodeStoredEnvelope(existing).lockedUnits }
    : {}

  if (input.lockUnit) {
    const { slotKey, unit } = input.lockUnit
    const contentHash = canonicalHash(unit)
    const prior = mergedLocked[slotKey]
    if (prior) {
      if (prior.payloadHash !== contentHash || prior.unitType !== unit.unitType) {
        throw new CompositeCheckpointError(
          409,
          'CHECKPOINT_LOCKED_UNIT_IMMUTABLE',
          `单元 ${slotKey} 已完成并锁定，不允许覆盖或重做`,
        )
      }
      // Idempotent retry of the exact same locked unit payload: preserve original lockedAt
    } else {
      mergedLocked[slotKey] = lockedCheckpointUnitSchema.parse({
        ...unit,
        lockedAt: now.toISOString(),
        payloadHash: contentHash,
      })
    }
  }

  // Strip draft entries for already-locked slots so drafts only retain in-progress answers
  const cleanDrafts: Record<string, Record<string, unknown>> = {}
  for (const [slotKey, draft] of Object.entries(input.drafts)) {
    if (!mergedLocked[slotKey]) cleanDrafts[slotKey] = draft
  }

  const nextEnvelope: CompositeAttemptCheckpointEnvelopeV1 = {
    schemaVersion: 1,
    publicationHash: input.publicationHash,
    drafts: cleanDrafts,
    ...(input.itemTimings && Object.keys(input.itemTimings).length > 0 ? { itemTimings: input.itemTimings } : {}),
    lockedUnits: mergedLocked,
  }
  const payloadHash = canonicalHash(nextEnvelope)
  const payloadCipher = encryptCompactField(nextEnvelope, MAX_CHECKPOINT_PLAIN_BYTES)
  const lockedSlotKeys = Object.keys(mergedLocked).sort()
  const nextRevision = currentRevision + 1
  const nextSaveCount = (existing?.saveCount ?? 0) + 1

  if (!existing) {
    const inserted = await db.$executeRaw(Prisma.sql`
      INSERT INTO composite_attempt_checkpoints (
        attempt_id, attempt_epoch, publication_hash, revision, save_count,
        locked_slot_keys, payload_cipher, payload_hash, expires_at, updated_at
      ) VALUES (
        ${input.attemptId}, ${input.attemptEpoch}, ${input.publicationHash}, ${nextRevision}, ${nextSaveCount},
        ${lockedSlotKeys}::text[], ${payloadCipher}, ${payloadHash}, ${expiresAt}, ${now}
      )
      ON CONFLICT (attempt_id) DO NOTHING
    `)
    if (inserted !== 1) {
      throw new CompositeCheckpointError(409, 'CHECKPOINT_CONFLICT', '草稿已被并发创建，请刷新后重试')
    }
  } else {
    const updated = await db.$executeRaw(Prisma.sql`
      UPDATE composite_attempt_checkpoints
      SET attempt_epoch = ${input.attemptEpoch},
          publication_hash = ${input.publicationHash},
          revision = ${nextRevision},
          save_count = ${nextSaveCount},
          locked_slot_keys = ${lockedSlotKeys}::text[],
          payload_cipher = ${payloadCipher},
          payload_hash = ${payloadHash},
          expires_at = ${expiresAt},
          updated_at = ${now}
      WHERE attempt_id = ${input.attemptId}
        AND attempt_epoch = ${input.attemptEpoch}
        AND revision = ${currentRevision}
    `)
    if (updated !== 1) {
      throw new CompositeCheckpointError(409, 'CHECKPOINT_CONFLICT', '草稿已被并发更新，请刷新后重试')
    }
  }

  return {
    revision: nextRevision,
    saveCount: nextSaveCount,
    lockedSlotKeys,
    expiresAt,
    updatedAt: now,
    envelope: nextEnvelope,
  }
}

/** Loads monotonically locked Cognitive/SJT units during whole-submit inside the final transaction. */
export async function readLockedUnitsForSubmit(
  db: CompositeCheckpointDb,
  input: {
    attemptId: string
    attemptEpoch: number
    publicationHash: string
  },
  lock = true,
): Promise<Record<string, LockedCheckpointUnitV1>> {
  const row = await loadCheckpointRow(db, input.attemptId, lock)
  if (!row || row.attemptEpoch !== input.attemptEpoch) return {}
  if (row.publicationHash !== input.publicationHash) {
    throw new CompositeCheckpointError(409, 'CHECKPOINT_IDENTITY_MISMATCH', '草稿锁定单元与冻结发布不一致')
  }
  return decodeStoredEnvelope(row).lockedUnits
}

/** Atomically deletes an active unlocked checkpoint without racing concurrent unit locks or FINAL commits. */
export async function deleteUnlockedCompositeCheckpoint(
  db: CompositeCheckpointDb,
  input: DeleteCompositeCheckpointInput,
): Promise<{ cleared: true }> {
  if (!HEX64_RE.test(input.publicationHash)) {
    throw new CompositeCheckpointError(400, 'CHECKPOINT_INVALID', '无效的发布快照摘要')
  }
  if (input.verifyAttemptActive !== false) {
    await lockAndAssertActiveAttempt(db, {
      attemptId: input.attemptId,
      attemptEpoch: input.attemptEpoch,
      publicationHash: input.publicationHash,
    })
  }
  const deleted = await db.$executeRaw(Prisma.sql`
    DELETE FROM composite_attempt_checkpoints
    WHERE attempt_id = ${input.attemptId}
      AND attempt_epoch = ${input.attemptEpoch}
      AND publication_hash = ${input.publicationHash}
      AND cardinality(locked_slot_keys) = 0
      ${input.expectedRevision !== undefined ? Prisma.sql`AND revision = ${input.expectedRevision}` : Prisma.empty}
  `)
  if (deleted > 0) return { cleared: true }

  const remaining = await loadCheckpointRow(db, input.attemptId, true)
  if (!remaining) return { cleared: true }
  if (remaining.attemptEpoch !== input.attemptEpoch || remaining.publicationHash !== input.publicationHash) {
    throw new CompositeCheckpointError(409, 'CHECKPOINT_IDENTITY_MISMATCH', '草稿与当前作答版本不一致')
  }
  if (remaining.lockedSlotKeys.length > 0) {
    throw new CompositeCheckpointError(409, 'CHECKPOINT_LOCKED_UNIT_IMMUTABLE', '存在已锁定的认知或情境单元，无法清空草稿')
  }
  if (input.expectedRevision !== undefined && remaining.revision !== input.expectedRevision) {
    throw new CompositeCheckpointError(409, 'CHECKPOINT_CONFLICT', `草稿版本冲突（预期 ${input.expectedRevision}，当前 ${remaining.revision}）`)
  }
  return { cleared: true }
}

/** Deletes the ephemeral checkpoint row once final submission commits (caller holds parent attempt lock). */
export async function clearCompositeCheckpoint(
  db: CompositeCheckpointDb,
  attemptId: string,
): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    DELETE FROM composite_attempt_checkpoints WHERE attempt_id = ${attemptId}
  `)
}
