import { canonicalHash, canonicalJsonString } from '../assessment-runtime/canonical'

export const TRAINING_CHECKPOINT_MAX_BYTES = 65_536
export const TRAINING_CHECKPOINT_MAX_SAVES = 100
export class TrainingPersistenceError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message) }
}
function invalid(message: string): never { throw new TrainingPersistenceError(400, message) }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key))
export type TrainingPersistencePolicy = {
  schemaVersion: 1
  checkpoint: { enabled: true; ttlHours: number } | null
  localCognitive: { enabled: true; ttlHours: number } | null
}
/** Authoring is strict. Runtime readers separately treat absent/unknown historical policies as off. */
export function parseTrainingPersistencePolicy(raw: unknown): TrainingPersistencePolicy | null {
  if (raw == null) return null
  if (!object(raw) || raw.schemaVersion !== 1 || !exactKeys(raw, ['schemaVersion', 'checkpoint', 'localCognitive'])) invalid('无效的 Training 草稿策略版本或字段')
  const setting = (value: unknown) => {
    if (value == null) return null
    if (!object(value) || !exactKeys(value, ['enabled', 'ttlHours']) || value.enabled !== true ||
      !Number.isInteger(value.ttlHours) || Number(value.ttlHours) < 1 || Number(value.ttlHours) > 48) invalid('草稿策略必须显式启用，TTL 为 1–48 整数小时')
    return { enabled: true as const, ttlHours: Number(value.ttlHours) }
  }
  return { schemaVersion: 1, checkpoint: setting(raw.checkpoint), localCognitive: setting(raw.localCognitive) }
}
export function readTrainingPersistencePolicy(raw: unknown): TrainingPersistencePolicy | null {
  try { return parseTrainingPersistencePolicy(raw) } catch { return null }
}
export type TrainingPersistenceSnapshot = {
  schemaVersion: 1
  attemptId: string
  attemptEpoch: number
  compositeId: string
  courseId: string
  publicationIdentity: Record<string, unknown>
  publicationHash: string
  policy: TrainingPersistencePolicy
  policyHash: string
  roundId: string | null
  frozenCutoff: string | null
}
const validDate = (value: Date | string): Date => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) invalid('草稿截止时间无效')
  return date
}
export function minimumTrainingCutoff(cutoffs: Array<Date | string | null | undefined>): Date | null {
  const times = cutoffs.filter((value): value is Date | string => value != null).map(value => validDate(value).getTime())
  return times.length ? new Date(Math.min(...times)) : null
}
export function freezeTrainingPersistenceSnapshot(input: {
  policy: unknown; policyHash: string | null; publicationIdentity: Record<string, unknown>
  attemptId: string; attemptEpoch: number; compositeId: string; courseId: string
  roundId?: string | null; cutoffs: Array<Date | string | null | undefined>
}): TrainingPersistenceSnapshot | null {
  const policy = readTrainingPersistencePolicy(input.policy)
  if (!policy || (!policy.checkpoint && !policy.localCognitive)) return null
  if (!input.policyHash || canonicalHash(policy) !== input.policyHash) invalid('Training 草稿策略摘要不匹配')
  if (!input.attemptId || !input.compositeId || !input.courseId || !Number.isSafeInteger(input.attemptEpoch) || input.attemptEpoch < 1) invalid('Training 草稿身份不完整')
  // The caller supplies the verified publication DTO, never mutable request fields.
  const identity = JSON.parse(canonicalJsonString(input.publicationIdentity)) as Record<string, unknown>
  if (identity.compositeId !== input.compositeId || identity.courseId !== input.courseId || typeof identity.publishedAt !== 'string') invalid('Training 发布身份不匹配')
  validDate(identity.publishedAt)
  return { schemaVersion: 1, attemptId: input.attemptId, attemptEpoch: input.attemptEpoch,
    compositeId: input.compositeId, courseId: input.courseId, publicationIdentity: identity,
    publicationHash: canonicalHash(identity), policy, policyHash: input.policyHash,
    roundId: input.roundId ?? null, frozenCutoff: minimumTrainingCutoff(input.cutoffs)?.toISOString() ?? null }
}
export function trainingCheckpointExpiry(snapshot: TrainingPersistenceSnapshot, now: Date, currentCutoffs: Array<Date | string | null | undefined>): Date {
  const policy = parseTrainingPersistencePolicy(snapshot.policy)
  if (!policy?.checkpoint) throw new TrainingPersistenceError(403, '此作答未启用 Checkpoint')
  const start = validDate(now)
  const expiry = minimumTrainingCutoff([new Date(start.getTime() + policy.checkpoint.ttlHours * 3_600_000), snapshot.frozenCutoff, ...currentCutoffs])!
  if (expiry <= start) throw new TrainingPersistenceError(403, '此作答的草稿保存期限已结束')
  return expiry
}
/** Check the complete envelope, not answers alone. Reject unsupported JSON rather than dropping fields. */
export function encodeTrainingCheckpointEnvelope(envelope: unknown): { plaintext: string; payloadHash: string; bytes: number } {
  let plaintext: string
  try { plaintext = canonicalJsonString(envelope) } catch { return invalid('Checkpoint 必须是有效的有限 JSON 数据') }
  const bytes = Buffer.byteLength(plaintext, 'utf8')
  if (bytes > TRAINING_CHECKPOINT_MAX_BYTES) throw new TrainingPersistenceError(413, 'Checkpoint 完整数据超过 64KB')
  return { plaintext, bytes, payloadHash: canonicalHash(envelope) }
}
/** The persisted save count is deliberately independent of CAS revision. */
export function nextTrainingCheckpointSave(state: { revision: number; successfulSaveCount: number }, expectedRevision: number) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) invalid('Checkpoint revision 无效')
  if (state.revision !== expectedRevision) throw new TrainingPersistenceError(409, 'Checkpoint 已被其他窗口更新，请明确选择恢复版本')
  if (state.successfulSaveCount >= TRAINING_CHECKPOINT_MAX_SAVES) throw new TrainingPersistenceError(429, '此作答已达到累计 100 次 Checkpoint 保存上限')
  return { revision: state.revision + 1, successfulSaveCount: state.successfulSaveCount + 1 }
}

export function readTrainingPersistenceSnapshot(attempt: { id: string; attemptEpoch: number; deliveryCourseId?: string | null;
  compositeAssessmentId?: string; trainingPersistenceSnapshot?: unknown; trainingPersistenceSnapshotHash?: string | null }): TrainingPersistenceSnapshot | null {
  const raw = attempt.trainingPersistenceSnapshot
  if (raw == null || !object(raw) || raw.schemaVersion !== 1) return null
  const snapshot = raw as unknown as TrainingPersistenceSnapshot
  if (!attempt.trainingPersistenceSnapshotHash || canonicalHash(raw) !== attempt.trainingPersistenceSnapshotHash ||
    snapshot.attemptId !== attempt.id || snapshot.attemptEpoch !== attempt.attemptEpoch ||
    snapshot.courseId !== attempt.deliveryCourseId || (attempt.compositeAssessmentId && snapshot.compositeId !== attempt.compositeAssessmentId) ||
    !readTrainingPersistencePolicy(snapshot.policy) || canonicalHash(snapshot.policy) !== snapshot.policyHash ||
    canonicalHash(snapshot.publicationIdentity) !== snapshot.publicationHash) throw new TrainingPersistenceError(409, 'Training 草稿冻结身份不匹配')
  return snapshot
}
export function trainingPersistenceMetadata(attempt: Parameters<typeof readTrainingPersistenceSnapshot>[0]) {
  const snapshot = readTrainingPersistenceSnapshot(attempt)
  if (!snapshot) return undefined
  return { snapshotHash: attempt.trainingPersistenceSnapshotHash!, attemptId: snapshot.attemptId,
    attemptEpoch: snapshot.attemptEpoch, courseId: snapshot.courseId,
    checkpoint: snapshot.policy.checkpoint, localCognitive: snapshot.policy.localCognitive }
}
