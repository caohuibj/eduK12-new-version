import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  clearCompositeCheckpoint,
  CompositeCheckpointError,
  readCompositeCheckpoint,
  readLockedUnitsForSubmit,
  saveCompositeCheckpoint,
} from '../../modules/assessment-runtime/composite-checkpoint.service'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

/** In-memory fake mimicking composite_attempt_checkpoints SQL queries + monotonic lock semantics. */
function makeCheckpointDb() {
  const store = new Map<string, any>()
  const db = {
    $queryRaw: vi.fn(async (sql: any) => {
      const text = Array.isArray(sql?.strings) ? sql.strings.join('?') : String(sql?.sql ?? '')
      if (text.includes('FROM composite_attempt_checkpoints')) {
        const attemptId = sql.values[0]
        const row = store.get(attemptId)
        return row ? [{ ...row, lockedSlotKeys: [...row.lockedSlotKeys] }] : []
      }
      return []
    }),
    $executeRaw: vi.fn(async (sql: any) => {
      const text = Array.isArray(sql?.strings) ? sql.strings.join('?') : String(sql?.sql ?? '')
      if (text.includes('INSERT INTO composite_attempt_checkpoints')) {
        const [attemptId, attemptEpoch, publicationHash, revision, saveCount, lockedSlotKeys, payloadCipher, payloadHash, expiresAt, updatedAt] = sql.values
        store.set(attemptId, { attemptId, attemptEpoch, publicationHash, revision, saveCount, lockedSlotKeys: [...lockedSlotKeys], payloadCipher, payloadHash, expiresAt, updatedAt })
        return 1
      }
      if (text.includes('UPDATE composite_attempt_checkpoints')) {
        const [attemptEpoch, publicationHash, revision, saveCount, lockedSlotKeys, payloadCipher, payloadHash, expiresAt, updatedAt, attemptId] = sql.values
        store.set(attemptId, { attemptId, attemptEpoch, publicationHash, revision, saveCount, lockedSlotKeys: [...lockedSlotKeys], payloadCipher, payloadHash, expiresAt, updatedAt })
        return 1
      }
      if (text.includes('DELETE FROM composite_attempt_checkpoints')) {
        store.delete(sql.values[0])
        return 1
      }
      return 0
    }),
  }
  return { store, db }
}

describe('composite-checkpoint service (universal drafts + monotonic Cognitive/SJT unit lock)', () => {
  const attemptId = '00000000-0000-4000-8000-000000000001'
  const pubHash = sha('publication-1')
  const t0 = new Date('2026-11-24T00:00:00.000Z')
  const t1 = new Date('2026-11-24T00:05:00.000Z')
  const tAfterExpiry = new Date('2026-11-26T00:00:00.000Z')

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('saves, reads, enforces CAS revision, and deletes expired unlocked drafts', async () => {
    const { db, store } = makeCheckpointDb()

    const empty = await readCompositeCheckpoint(db, { attemptId, attemptEpoch: 1, publicationHash: pubHash, now: t0 })
    expect(empty).toMatchObject({ revision: 0, lockedSlotKeys: [], envelope: null })

    const s1 = await saveCompositeCheckpoint(db, {
      attemptId,
      attemptEpoch: 1,
      publicationHash: pubHash,
      expectedRevision: 0,
      drafts: { 'scale:s1': { q1: 3, q2: 4 } },
      now: t0,
    })
    expect(s1.revision).toBe(1)
    expect(s1.saveCount).toBe(1)

    // Stale CAS revision rejected
    await expect(saveCompositeCheckpoint(db, {
      attemptId,
      attemptEpoch: 1,
      publicationHash: pubHash,
      expectedRevision: 0,
      drafts: { 'scale:s1': { q1: 5 } },
      now: t1,
    })).rejects.toMatchObject({ statusCode: 409, code: 'CHECKPOINT_CONFLICT' })

    const readBack = await readCompositeCheckpoint(db, { attemptId, attemptEpoch: 1, publicationHash: pubHash, now: t1 })
    expect(readBack.revision).toBe(1)
    expect(readBack.envelope?.drafts).toEqual({ 'scale:s1': { q1: 3, q2: 4 } })

    // Unlocked draft auto-clears on expiry
    const expired = await readCompositeCheckpoint(db, { attemptId, attemptEpoch: 1, publicationHash: pubHash, now: tAfterExpiry })
    expect(expired.revision).toBe(0)
    expect(expired.envelope).toBeNull()
    expect(store.size).toBe(0)
  })

  it('monotonically locks Cognitive units, allows idempotent retry, blocks overwrite, and retains locks past draft TTL', async () => {
    const { db, store } = makeCheckpointDb()
    const cogSlot = 'cognitive:cog-1'
    const cogPayload = {
      unitType: 'COGNITIVE' as const,
      itemId: 'cog-1',
      randomSeed: 'seed-1',
      trials: [{ idx: 0, rt: 350, correct: true }],
    }

    const locked = await saveCompositeCheckpoint(db, {
      attemptId,
      attemptEpoch: 1,
      publicationHash: pubHash,
      expectedRevision: 0,
      drafts: { 'scale:s1': { q1: 2 }, [cogSlot]: { stale: true } },
      lockUnit: { slotKey: cogSlot, unit: cogPayload },
      now: t0,
    })
    expect(locked.revision).toBe(1)
    expect(locked.lockedSlotKeys).toEqual([cogSlot])
    // Draft for locked slot is stripped
    expect(locked.envelope?.drafts).toEqual({ 'scale:s1': { q1: 2 } })
    expect(locked.envelope?.lockedUnits[cogSlot].lockedAt).toBe(t0.toISOString())

    // Idempotent retry with identical payload succeeds and keeps original lockedAt
    const retried = await saveCompositeCheckpoint(db, {
      attemptId,
      attemptEpoch: 1,
      publicationHash: pubHash,
      expectedRevision: 1,
      drafts: { 'scale:s1': { q1: 2, q2: 5 } },
      lockUnit: { slotKey: cogSlot, unit: cogPayload },
      now: t1,
    })
    expect(retried.revision).toBe(2)
    expect(retried.envelope?.lockedUnits[cogSlot].lockedAt).toBe(t0.toISOString())

    // Attempting to overwrite locked Cognitive unit with tampered trials fails 409
    await expect(saveCompositeCheckpoint(db, {
      attemptId,
      attemptEpoch: 1,
      publicationHash: pubHash,
      expectedRevision: 2,
      drafts: { 'scale:s1': { q1: 2 } },
      lockUnit: {
        slotKey: cogSlot,
        unit: { ...cogPayload, trials: [{ idx: 0, rt: 120, correct: true }] },
      },
      now: t1,
    })).rejects.toMatchObject({ statusCode: 409, code: 'CHECKPOINT_LOCKED_UNIT_IMMUTABLE' })

    // Even after draft TTL expires, locked Cognitive unit is preserved while drafts are cleared!
    const afterTtl = await readCompositeCheckpoint(db, { attemptId, attemptEpoch: 1, publicationHash: pubHash, now: tAfterExpiry })
    expect(afterTtl.lockedSlotKeys).toEqual([cogSlot])
    expect(afterTtl.envelope?.drafts).toEqual({})
    expect(afterTtl.envelope?.lockedUnits[cogSlot].trials).toEqual(cogPayload.trials)
    expect(store.size).toBe(1)

    // Whole-submit reads locked units and clears ephemeral row on commit
    const forSubmit = await readLockedUnitsForSubmit(db, { attemptId, attemptEpoch: 1, publicationHash: pubHash })
    expect(forSubmit[cogSlot].trials).toEqual(cogPayload.trials)

    await clearCompositeCheckpoint(db, attemptId)
    expect(store.size).toBe(0)
  })

  it('rejects unknown slotKeys and prototype-polluting keys', async () => {
    const { db } = makeCheckpointDb()
    await expect(saveCompositeCheckpoint(db, {
      attemptId,
      attemptEpoch: 1,
      publicationHash: pubHash,
      expectedRevision: 0,
      drafts: { 'scale:unknown': { q1: 1 } },
      allowedSlotKeys: new Set(['scale:s1']),
      now: t0,
    })).rejects.toThrow(CompositeCheckpointError)

    await expect(saveCompositeCheckpoint(db, {
      attemptId,
      attemptEpoch: 1,
      publicationHash: pubHash,
      expectedRevision: 0,
      drafts: { 'scale:s1': JSON.parse('{"__proto__": {"polluted": true}}') },
      now: t0,
    })).rejects.toMatchObject({ statusCode: 400, code: 'CHECKPOINT_INVALID' })
  })
})
