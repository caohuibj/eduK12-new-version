// Generated from exact task-owned envelope SHA256: 91dc7f36771792a5a694858e722b6470c0d5416665c72adf550872d8f630e09e
import type {BlinkRaw} from './protocol'
export const blinkEnvelope = (raw: BlinkRaw) => ({ schemaVersion: 1, trialIndex: raw.plan.index, phase: 'test', condition: raw.plan.condition, startedAtPerfMs: raw.startedAtPerfMs, endedAtPerfMs: raw.endedAtPerfMs, durationMs: raw.endedAtPerfMs - raw.startedAtPerfMs, flags: { timeout: false, premature: false }, qualityEvents: raw.status === 'interrupted' ? ['resume'] : [], payload: raw })
