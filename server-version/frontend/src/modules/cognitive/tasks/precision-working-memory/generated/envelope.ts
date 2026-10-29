// Generated from exact task-owned envelope SHA256: 7cce214668d4e4e2569ad988d1d580936a553558f384593f9c76edf92b8f7b6b
import type {SpatialRaw} from './protocol'
export const spatialEnvelope = (raw: SpatialRaw) => {
    return { schemaVersion: 1, phase: 'test', trialIndex: raw.plan.index, condition: String(raw.plan.setSize),
        startedAtPerfMs: raw.startedAtPerfMs, endedAtPerfMs: raw.endedAtPerfMs, durationMs: raw.endedAtPerfMs - raw.startedAtPerfMs,
        flags: { timeout: false, premature: false }, qualityEvents: raw.status === 'interrupted' ? ['resume'] : [], payload: raw };
}
