import { assertProtocolSignature, computeConfigSnapshotHash } from './canonical'
import { parseSessionConfigSnapshot } from './session-snapshot'
import { validateAndNormalizeTrial } from './trial-normalizer'
import type {
  CognitiveScoreResult,
  SessionConfigSnapshot,
  TaskDefinition,
  TrialEnvelope,
} from './types'

export const validateSessionConfigSnapshot = <TConfig>(snapshot: SessionConfigSnapshot<TConfig>): void => {
  parseSessionConfigSnapshot(snapshot)
  if (snapshot.schemaVersion !== 1) throw new Error('Unsupported cognitive session snapshot schema')
  if (!snapshot.frozenAt || !Number.isFinite(Date.parse(snapshot.frozenAt))) throw new Error('Invalid session snapshot frozenAt')
  const expectedConfigHash = snapshot.hashScheme === 'CANONICAL_JSON_SHA256_V1'
    ? undefined
    : computeConfigSnapshotHash(snapshot.config)
  if (expectedConfigHash !== undefined && expectedConfigHash !== snapshot.configHash) {
    throw new Error('config snapshot hash mismatch')
  }
  assertProtocolSignature(snapshot)
}

export const runAuthoritativeScorer = <TConfig, TTrial>(input: {
  definition: TaskDefinition<TConfig, TTrial>
  session: SessionConfigSnapshot<TConfig>
  trials: unknown[]
  /** Final-only submitters already parsed the envelope and payload schema. */
  preparedTrials?: TrialEnvelope<TTrial>[]
  randomSeed: string
}): CognitiveScoreResult => {
  validateSessionConfigSnapshot(input.session)
  if (input.session.testType !== input.definition.testType
    || input.session.engineVersion !== input.definition.engineVersion
    || input.session.scoringVersion !== input.definition.scoringVersion) {
    throw new Error('Session snapshot version does not match the authoritative task definition')
  }
  const validateEnvelope = (envelope: TrialEnvelope<TTrial>, index: number, parsePayload: boolean) => {
    if (envelope.trialIndex !== index) throw new Error('Trial envelopes must be ordered and contiguous for scoring')
    const phase = input.session.protocol.phases.find((candidate) => candidate.key === envelope.phase)
    if (!phase || !phase.persists) throw new Error(`Trial envelope phase ${envelope.phase} is not persisted by the frozen protocol`)
    const payload = parsePayload ? input.definition.trialSchema.parse(envelope.payload) : envelope.payload
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const declaredPhase = (payload as { phase?: unknown }).phase
      if ((declaredPhase === 'learning' || declaredPhase === 'delayed') && declaredPhase !== envelope.phase) {
        throw new Error('Trial payload phase does not match the envelope phase')
      }
    }
    return { ...envelope, payload } as TrialEnvelope<TTrial>
  }
  const trials = input.preparedTrials
    ? input.preparedTrials.map((trial, index) => validateEnvelope(trial, index, false))
    : input.trials.map((trial, index) => validateEnvelope(
        validateAndNormalizeTrial({ definition: input.definition, value: trial }),
        index,
        false,
      ))
  const result = input.definition.scorer({
    config: input.definition.configSchema.parse(input.session.config),
    session: input.session,
    trials,
    randomSeed: input.randomSeed,
  })
  if (!result || typeof result !== 'object' || !result.quality || !result.metrics) throw new Error('Authoritative scorer returned an invalid result')
  if (result.audit.trialCount !== trials.length) throw new Error('Authoritative scorer trialCount must match the input')
  return result
}
