// Generated from exact task-owned envelope SHA256: 9fa1b2b358e024daf4fb1a364ba5d0dc167e6bfcd72b23acd03f4faeb58d4d40
import type {EffortRaw} from './protocol'
export const effortEnvelope = (raw: EffortRaw) => ({ schemaVersion: 1, trialIndex: raw.plan.index, phase: 'test', condition: raw.plan.conditionKey,
    startedAtPerfMs: raw.startedAtPerfMs, endedAtPerfMs: raw.endedAtPerfMs, durationMs: raw.endedAtPerfMs - raw.startedAtPerfMs,
    flags: { timeout: false, premature: false }, qualityEvents: raw.status === 'interrupted' ? ['resume'] : [], payload: raw })
