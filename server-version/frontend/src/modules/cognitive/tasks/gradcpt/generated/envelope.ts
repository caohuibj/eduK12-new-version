// Generated from exact task-owned envelope SHA256: 0c912c309483c5cad7587c5bac085edc4f6d9d85122f3d00b0365f7aef8d34ef
import type {GradRaw} from './protocol'
export const gradEnvelope = (raw: GradRaw) => ({ schemaVersion: 1, trialIndex: 0, phase: 'test', condition: 'continuous', startedAtPerfMs: raw.startedAtPerfMs, endedAtPerfMs: raw.endedAtPerfMs, durationMs: raw.endedAtPerfMs - raw.startedAtPerfMs, flags: { timeout: false, premature: false }, qualityEvents: raw.status === 'interrupted' ? ['resume'] : [], payload: raw })
