export type CognitiveTrialPhase = 'test' | 'learning' | 'delayed'

export interface CognitiveTrialEnvelope {
  schemaVersion: 1
  trialIndex: number
  phase: CognitiveTrialPhase
  condition?: string
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
  identity?: { testType: string; engineVersion: string; scoringVersion: string; configVersion: string }
}): CognitiveTrialEnvelope => {
  if (input.identity?.testType === 'simon') {
    if (input.identity.engineVersion !== '1.0.0' || input.identity.scoringVersion !== '1.0.0' || input.identity.configVersion !== '1.0.0') throw new Error('Unsupported Simon envelope identity')
    const payload=input.payload
    const timing=payload.timing as {strategy?:unknown;onsetPerfMs?:unknown;windowEndPerfMs?:unknown}|undefined
    if(timing?.strategy!=='double-raf-performance-v1'||typeof timing.windowEndPerfMs!=='number'||!Number.isFinite(timing.windowEndPerfMs)||timing.windowEndPerfMs<0
      ||(timing.onsetPerfMs!==null&&(typeof timing.onsetPerfMs!=='number'||!Number.isFinite(timing.onsetPerfMs)||timing.onsetPerfMs<0))) throw new Error('Missing Simon observed timing')
    if(!['red','blue'].includes(String(payload.color))||!['red-left','blue-left'].includes(String(payload.mapping))||!['left','right'].includes(String(payload.stimulusSide))) throw new Error('Invalid Simon stimulus identity')
    const requiredSide=(payload.color==='red')===(payload.mapping==='red-left')?'left':'right'
    if(payload.requiredSide!==requiredSide)throw new Error('Invalid Simon response mapping')
    const endedAtPerfMs=timing.windowEndPerfMs,startedAtPerfMs=timing.onsetPerfMs===null?endedAtPerfMs:timing.onsetPerfMs as number
    if(endedAtPerfMs<startedAtPerfMs)throw new Error('Invalid Simon observed timing order')
    return {schemaVersion:1,trialIndex:input.trialIndex,phase:'test',condition:payload.stimulusSide===requiredSide?'congruent':'incongruent',
      startedAtPerfMs,endedAtPerfMs,durationMs:endedAtPerfMs-startedAtPerfMs,
      flags:{timeout:payload.timeout===true,premature:false},qualityEvents:[],payload}
  }
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
