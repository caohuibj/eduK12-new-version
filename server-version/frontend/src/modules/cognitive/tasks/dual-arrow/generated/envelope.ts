// Generated from exact task-owned envelope SHA256: 95be6754c8093e39e0604cd4ebb47a73df1fa08a31e775c753fbce12b91a2f71
import type {DualRaw} from './protocol'
export const dualEnvelope = (raw: DualRaw) => ({ schemaVersion: 1, trialIndex: raw.plan.index, phase: 'test', condition: raw.plan.mode, startedAtPerfMs: raw.startedAtPerfMs, endedAtPerfMs: raw.endedAtPerfMs, durationMs: raw.endedAtPerfMs - raw.startedAtPerfMs, flags: { timeout: false, premature: false }, qualityEvents: raw.status === 'interrupted' ? ['resume'] : [], payload: raw })
