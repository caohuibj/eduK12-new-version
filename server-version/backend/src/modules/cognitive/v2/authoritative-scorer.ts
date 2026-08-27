import { parseTrialEnvelope } from './trial-envelope'
import { assertProtocolSignature, computeConfigSnapshotHash } from './canonical'
import { assertTaskCanPublish } from './publication-gate'
import { parseSessionConfigSnapshot } from './session-snapshot'
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
  if (computeConfigSnapshotHash(snapshot.config) !== snapshot.configHash) throw new Error('config snapshot hash mismatch')
  assertProtocolSignature(snapshot)
}

export const runAuthoritativeScorer = <TConfig, TTrial>(input: {
  definition: TaskDefinition<TConfig, TTrial>
  session: SessionConfigSnapshot<TConfig>
  trials: unknown[]
  randomSeed: string
}): CognitiveScoreResult => {
  assertTaskCanPublish(input.definition)
  validateSessionConfigSnapshot(input.session)
  if (input.session.testType !== input.definition.testType
    || input.session.engineVersion !== input.definition.engineVersion
    || input.session.scoringVersion !== input.definition.scoringVersion) {
    throw new Error('Session snapshot version does not match the authoritative task definition')
  }
  const trials = input.trials.map((trial, index) => {
    const envelope = parseTrialEnvelope<TTrial>(trial)
    if (envelope.trialIndex !== index) throw new Error('Trial envelopes must be ordered and contiguous for scoring')
    const phase = input.session.protocol.phases.find((candidate) => candidate.key === envelope.phase)
    if (!phase || !phase.persists) throw new Error(`Trial envelope phase ${envelope.phase} is not persisted by the frozen protocol`)
    const payload = input.definition.trialSchema.parse(envelope.payload)
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const declaredPhase = (payload as { phase?: unknown }).phase
      if ((declaredPhase === 'learning' || declaredPhase === 'delayed') && declaredPhase !== envelope.phase) {
        throw new Error('Trial payload phase does not match the envelope phase')
      }
    }
    return { ...envelope, payload } as TrialEnvelope<TTrial>
  })
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
