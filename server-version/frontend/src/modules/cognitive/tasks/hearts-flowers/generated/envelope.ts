// Generated from exact task-owned envelope SHA256: b1f05747774663be86ecb459047fb9907b7a060702c39feb8344f2414e9836ab
import type {HFRaw} from './protocol'
export const hfEnvelope = (raw: HFRaw) => ({ schemaVersion: 1, trialIndex: raw.plan.index, phase: 'test', condition: raw.plan.mode, startedAtPerfMs: raw.startedAtPerfMs, endedAtPerfMs: raw.endedAtPerfMs, durationMs: raw.endedAtPerfMs - raw.startedAtPerfMs, flags: { timeout: false, premature: false }, qualityEvents: raw.status === 'interrupted' ? ['resume'] : [], payload: raw })
