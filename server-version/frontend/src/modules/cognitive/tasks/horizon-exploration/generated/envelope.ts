// Generated from exact task-owned envelope SHA256: e53fa4316d1d52c9d1106b743d279f5c1b2d9b1f01f1ee44cbf1989a4c6f876b
import type {HorizonRaw} from './protocol'
export const horizonEnvelope = (raw: HorizonRaw) => ({ schemaVersion: 1, trialIndex: raw.plan.index, phase: 'test', condition: `${raw.plan.information}:${raw.plan.freeChoices}`, startedAtPerfMs: raw.startedAtPerfMs, endedAtPerfMs: raw.endedAtPerfMs, durationMs: raw.endedAtPerfMs - raw.startedAtPerfMs, flags: { timeout: false, premature: false }, qualityEvents: raw.status === 'interrupted' ? ['resume'] : [], payload: raw })
