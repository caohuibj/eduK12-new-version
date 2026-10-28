// Generated from exact task-owned envelope SHA256: 7d3f8afe024067b6366aad9208159f63a930e9ebefffe55c62d187101b3b80f4
import type {SearchRaw} from './protocol'
export const searchEnvelope = (raw: SearchRaw) => ({ schemaVersion: 1, trialIndex: raw.plan.index, phase: 'test', condition: raw.plan.condition, startedAtPerfMs: raw.startedAtPerfMs, endedAtPerfMs: raw.endedAtPerfMs, durationMs: raw.endedAtPerfMs - raw.startedAtPerfMs, flags: { timeout: false, premature: false }, qualityEvents: raw.status === 'interrupted' ? ['resume'] : [], payload: raw })
