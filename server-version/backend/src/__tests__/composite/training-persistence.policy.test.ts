import { describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { encodeTrainingCheckpointEnvelope, freezeTrainingPersistenceSnapshot, nextTrainingCheckpointSave,
  parseTrainingPersistencePolicy, readTrainingPersistencePolicy, trainingCheckpointExpiry } from '../../modules/composite/training-persistence.policy'

const policy = { schemaVersion: 1, checkpoint: { enabled: true, ttlHours: 48 }, localCognitive: null }
const now = new Date('2026-10-19T00:00:00.000Z')
const snapshot = (roundId: string | null = null, cutoffs: Array<Date | null> = []) => freezeTrainingPersistenceSnapshot({
  policy, policyHash: canonicalHash(policy), attemptId: 'attempt', attemptEpoch: 1, compositeId: 'composite', courseId: 'course',
  publicationIdentity: { schemaVersion: 1, compositeId: 'composite', courseId: 'course', publishedAt: now.toISOString() }, roundId, cutoffs,
})!
describe('Training persistence pure policy contracts', () => {
  it('leaves old, absent, unknown and malformed runtime policies off', () => {
    for (const value of [null, undefined, {}, { schemaVersion: 2, checkpoint: policy.checkpoint }, { ...policy, unexpected: true }]) expect(readTrainingPersistencePolicy(value)).toBeNull()
    expect(freezeTrainingPersistenceSnapshot({ policy: null } as any)).toBeNull()
  })
  it('requires explicit enabled 1–48 integral hour settings', () => {
    for (const ttlHours of [1, 48]) expect(parseTrainingPersistencePolicy({ ...policy, checkpoint: { enabled: true, ttlHours } })?.checkpoint?.ttlHours).toBe(ttlHours)
    for (const ttlHours of [0, 49, 1.5, '1', NaN]) expect(() => parseTrainingPersistencePolicy({ ...policy, checkpoint: { enabled: true, ttlHours } })).toThrow()
    expect(() => parseTrainingPersistencePolicy({ ...policy, checkpoint: { ttlHours: 1 } })).toThrow()
  })
  it('local cognitive TTL is independent and defaults off', () => {
    expect(parseTrainingPersistencePolicy(policy)?.localCognitive).toBeNull()
    expect(parseTrainingPersistencePolicy({ schemaVersion: 1, localCognitive: { enabled: true, ttlHours: 3 } })).toEqual({ schemaVersion: 1, checkpoint: null, localCognitive: { enabled: true, ttlHours: 3 } })
    expect(() => parseTrainingPersistencePolicy({ schemaVersion: 1, localCognitive: { enabled: true, ttlHours: 168 } })).toThrow()
  })
  it('needs no round/token, allows long task windows, and clips each payload to TTL', () => {
    const grant = snapshot(null, [new Date('2026-12-01')])
    expect(grant.roundId).toBeNull()
    expect(trainingCheckpointExpiry(grant, now, []).toISOString()).toBe('2026-10-21T00:00:00.000Z')
    expect(trainingCheckpointExpiry(snapshot(), now, []).toISOString()).toBe('2026-10-21T00:00:00.000Z')
  })
  it('clips to frozen and newly earlier actual cutoffs, never later extensions', () => {
    const grant = snapshot('round', [new Date('2026-10-20')])
    expect(trainingCheckpointExpiry(grant, now, [new Date('2026-10-22')]).toISOString()).toBe('2026-10-20T00:00:00.000Z')
    expect(trainingCheckpointExpiry(grant, now, [new Date('2026-10-19T12:00:00Z')]).toISOString()).toBe('2026-10-19T12:00:00.000Z')
    expect(() => trainingCheckpointExpiry(grant, now, [now])).toThrow()
    expect(() => trainingCheckpointExpiry(grant, now, ['invalid'])).toThrow()
  })
  it('binds policy and canonical publication identity', () => {
    const grant = snapshot()
    expect(grant.policyHash).toBe(canonicalHash(grant.policy))
    expect(grant.publicationHash).toBe(canonicalHash(grant.publicationIdentity))
    expect(() => freezeTrainingPersistenceSnapshot({ ...grant, policyHash: 'wrong', cutoffs: [] })).toThrow()
    expect(() => freezeTrainingPersistenceSnapshot({ ...grant, courseId: 'other', cutoffs: [] })).toThrow()
  })
  it('measures all canonical envelope UTF-8 bytes including metadata', () => {
    const make = (answer: string) => ({ schemaVersion: 1, timing: { elapsed: 1 }, answers: { answer } })
    const overhead = encodeTrainingCheckpointEnvelope(make('')).bytes
    expect(encodeTrainingCheckpointEnvelope(make('a'.repeat(65536 - overhead))).bytes).toBe(65536)
    expect(() => encodeTrainingCheckpointEnvelope(make('a'.repeat(65537 - overhead)))).toThrow()
    expect(encodeTrainingCheckpointEnvelope(make('中')).bytes).toBe(overhead + 3)
    expect(() => encodeTrainingCheckpointEnvelope({ omitted: undefined })).toThrow()
    expect(() => encodeTrainingCheckpointEnvelope({ value: Infinity })).toThrow()
  })
  it('separates save budget from monotonically advancing clear/expiry revisions', () => {
    let state = { revision: 0, successfulSaveCount: 0 }
    for (let i = 0; i < 100; i++) {
      state = nextTrainingCheckpointSave(state, state.revision)
      state = { ...state, revision: state.revision + 1 } // clearing keeps identity/count
    }
    expect(state).toEqual({ revision: 200, successfulSaveCount: 100 })
    expect(() => nextTrainingCheckpointSave(state, 200)).toThrow('100')
    expect(() => nextTrainingCheckpointSave({ revision: 2, successfulSaveCount: 1 }, 1)).toThrow('其他窗口')
  })
})
