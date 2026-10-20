import { sessionFetch } from '../../api/client'
import type { SurveyScaleTimings } from '../scale/item-timing'
export type TrainingPersistence = { snapshotHash: string; attemptId: string; attemptEpoch: number; courseId: string; checkpoint: { enabled: true; ttlHours: number } | null; localCognitive: { enabled: true; ttlHours: number } | null }
export type TrainingCheckpointDraft = { slotKey: string; answers: Record<string, unknown>; itemTimings?: SurveyScaleTimings }
export type TrainingCheckpointEnvelope = { schemaVersion: 1; snapshotHash: string; definitionHash: string; drafts: TrainingCheckpointDraft[]; cognitiveResults: Array<{slotKey: string; resultId: string; sessionId: string; submissionId: string}> }
export type TrainingCheckpoint = { discardedTerminalSlotKeys?: string[]; revision: number; successfulSaveCount: number; expiresAt: string | null; envelope: TrainingCheckpointEnvelope | null; trainingPersistence: TrainingPersistence }
export function assertCheckpointBinding(value: TrainingCheckpoint, policy: TrainingPersistence, definitionHash: string) {
  if (!Number.isInteger(value.revision) || value.revision < 0 || !Number.isInteger(value.successfulSaveCount) || value.successfulSaveCount < 0 || value.trainingPersistence?.snapshotHash !== policy.snapshotHash || value.trainingPersistence.attemptId !== policy.attemptId || value.trainingPersistence.attemptEpoch !== policy.attemptEpoch || (value.envelope && (value.envelope.snapshotHash !== policy.snapshotHash || value.envelope.definitionHash !== definitionHash))) throw new Error('服务器草稿与当前作答不匹配，本机草稿已保留。')
}
export async function requestTrainingCheckpoint(attemptId: string, publicMode: boolean, recoveryToken: string | undefined, method: 'GET' | 'PUT' | 'DELETE', body?: unknown): Promise<TrainingCheckpoint> {
  if (publicMode && !recoveryToken) throw new Error('缺少本次作答恢复凭证。')
  const response = await sessionFetch(`/api/${publicMode ? 'public/' : ''}composite-assessments/attempts/${encodeURIComponent(attemptId)}/checkpoint`, {method, headers: {'Content-Type':'application/json', ...(publicMode ? {'X-Recovery-Token':recoveryToken!} : {})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})})
  const payload = await response.json()
  if (!response.ok || payload.code !== 0 || !payload.data || payload.data.closed) throw Object.assign(new Error(payload.message || '服务器草稿暂不可用，本机草稿已保留。'), {status:response.status,code:payload.code})
  return payload.data
}
