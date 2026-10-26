import { createTrialEnvelope } from '../../v2/trial-envelope'
import type { TrialQualityEvent } from '../../v2/types'
import { parseEnumerationTrial } from './schema'
import type { EnumerationTrial } from './protocol'
/** Formal only. Practice has a separate generation stream and cannot enter the persisted formal scorer. */
export function enumerationTrialEnvelope(value: EnumerationTrial, qualityEvents: TrialQualityEvent[] = []) {
  const trial = parseEnumerationTrial(value)
  return createTrialEnvelope({ trialIndex: trial.plan.trialIndex, phase: 'test',
    condition: String(trial.plan.targetValue), payload: trial,
    startedAtPerfMs: trial.startedAtPerfMs, endedAtPerfMs: trial.endedAtPerfMs,
    timeout: trial.timedOut, premature: trial.prematureInputs > 0, qualityEvents })
}
