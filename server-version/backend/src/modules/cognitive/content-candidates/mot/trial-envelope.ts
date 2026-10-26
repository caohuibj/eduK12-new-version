import type { TrialEnvelope, TrialQualityEvent } from '../../v2/types'
import type { MotTrial } from './protocol'
import { parseMotTrial } from './schema'
/** Native integration must preserve task clocks instead of guessing onset from submit time. */
export function motTrialEnvelope(value: unknown): TrialEnvelope<MotTrial> {
  const payload=parseMotTrial(value)
  const qualityEvents:TrialQualityEvent[]=payload.interruptions.filter((event):event is 'visibility_lost'|'window_blur'|'runner_restart'=>event!=='viewport_changed')
  return {schemaVersion:1,trialIndex:payload.trialIndex,phase:'test',condition:String(payload.speed),
    startedAtPerfMs:payload.startedAtPerfMs,endedAtPerfMs:payload.endedAtPerfMs,
    durationMs:payload.completionTimeMs,flags:{timeout:payload.timedOut,premature:payload.prematureInputs>0},
    qualityEvents,payload}
}
