export type CognitiveTrialPhase = 'test' | 'learning' | 'delayed'

export interface CognitiveTrialEnvelope {
  schemaVersion: 1
  trialIndex: number
  phase: CognitiveTrialPhase
  startedAtPerfMs: number
  endedAtPerfMs: number
  durationMs: number
  flags: { timeout: boolean; premature: boolean }
  qualityEvents: Array<'visibility_lost' | 'window_blur' | 'resume' | 'runner_restart'>
  payload: Record<string, unknown>
}

const clockNow = (): number => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
)

const asRecord = (value: Record<string, unknown>): Record<string, unknown> => value

const durationFromPayload = (payload: Record<string, unknown>): number => {
  for (const key of ['responseDurationMs', 'responseTimeMs', 'completionTimeMs', 'rtMs']) {
    const value = payload[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  }
  return 0
}

/**
 * v1 is a transport wrapper around the task's observable raw response. The
 * current runner derives envelope timing/events from that response when
 * available; these fields are not an independent authoritative telemetry
 * stream. The server validates the envelope and never treats its phase/flags
 * as an answer key or a score.
 */
export const wrapCognitiveTrial = (input: {
  trialIndex: number
  payload: Record<string, unknown>
}): CognitiveTrialEnvelope => {
  const endedAtPerfMs = clockNow()
  const durationMs = durationFromPayload(input.payload)
  const startedAtPerfMs = Math.max(0, endedAtPerfMs - durationMs)
  const payloadPhase = input.payload.phase
  const phase: CognitiveTrialPhase = payloadPhase === 'delayed'
    ? 'delayed'
    : payloadPhase === 'learning' || payloadPhase === 'immediate'
      ? 'learning'
      : 'test'
  const qualityEvents = input.payload.interrupted === true
    ? ['visibility_lost' as const]
    : []
  return {
    schemaVersion: 1,
    trialIndex: input.trialIndex,
    phase,
    startedAtPerfMs,
    endedAtPerfMs,
    durationMs,
    flags: {
      timeout: input.payload.timedOut === true,
      premature: input.payload.premature === true,
    },
    qualityEvents,
    payload: asRecord(input.payload),
  }
}
