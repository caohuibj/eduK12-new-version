export type CheckpointScopeType = 'scale' | 'questionnaire' | 'cognitive'

export interface PendingCheckpoint<TPayload = unknown> {
  id: string
  scopeType: CheckpointScopeType
  scopeId: string
  sequence: number
  payload: TPayload
  createdAt: number
  attempts: number
}

export interface AppendCheckpointInput<TPayload = unknown> {
  scopeType: CheckpointScopeType
  scopeId: string
  payload: TPayload
  createdAt?: number
}

export interface CheckpointBatch<TPayload = unknown> {
  scopeType: CheckpointScopeType
  scopeId: string
  records: Array<PendingCheckpoint<TPayload>>
}

export interface CheckpointAck {
  acceptedIds?: string[]
  acceptedSequences?: number[]
  acceptedSequence?: number
}

export interface CheckpointStore {
  append<TPayload>(input: AppendCheckpointInput<TPayload>): Promise<PendingCheckpoint<TPayload>>
  list<TPayload>(scopeType: CheckpointScopeType, scopeId: string): Promise<Array<PendingCheckpoint<TPayload>>>
  remove(ids: string[]): Promise<void>
  incrementAttempts(ids: string[]): Promise<void>
  count(scopeType: CheckpointScopeType, scopeId: string): Promise<number>
  purgeExpired(scopeType?: CheckpointScopeType, scopeId?: string): Promise<void>
}

export const checkpointScopeKey = (scopeType: CheckpointScopeType, scopeId: string) => `${scopeType}:${scopeId}`

export const checkpointId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `checkpoint-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
