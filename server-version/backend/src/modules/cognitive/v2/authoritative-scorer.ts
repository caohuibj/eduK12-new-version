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

export type PreparedAuthoritativeScorerContext<TConfig, TTrial> = Readonly<{
  definition: TaskDefinition<TConfig, TTrial>
  session: SessionConfigSnapshot<TConfig>
  config: TConfig
  trials: TrialEnvelope<TTrial>[]
  randomSeed: string
}>

const preparedScorerContexts = new WeakSet<object>()

const validatePreparedTrialEnvelopes = <TConfig, TTrial>(input: {
  definition: TaskDefinition<TConfig, TTrial>
  session: SessionConfigSnapshot<TConfig>
  trials: TrialEnvelope<TTrial>[]
}): TrialEnvelope<TTrial>[] => input.trials.map((envelope, index) => {
  if (envelope.trialIndex !== index) throw new Error('Trial envelopes must be ordered and contiguous for scoring')
  const phase = input.session.protocol.phases.find((candidate) => candidate.key === envelope.phase)
  if (!phase || !phase.persists) throw new Error(`Trial envelope phase ${envelope.phase} is not persisted by the frozen protocol`)
  const payload = envelope.payload
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const declaredPhase = (payload as { phase?: unknown }).phase
    if ((declaredPhase === 'learning' || declaredPhase === 'delayed') && declaredPhase !== envelope.phase) {
      throw new Error('Trial payload phase does not match the envelope phase')
    }
  }
  return { ...envelope, payload }
})

/**
 * Internal server boundary for inputs whose snapshot, config and trial payload
 * schemas have already been validated in this request. The WeakSet brand makes
 * an arbitrary JSON object or boolean flag insufficient to enter the prepared
 * scorer path.
 */
export const prepareAuthoritativeScorerContext = <TConfig, TTrial>(input: {
  definition: TaskDefinition<TConfig, TTrial>
  session: SessionConfigSnapshot<TConfig>
  config: TConfig
  trials: TrialEnvelope<TTrial>[]
  randomSeed: string
}): PreparedAuthoritativeScorerContext<TConfig, TTrial> => {
  if (input.session.testType !== input.definition.testType
    || input.session.engineVersion !== input.definition.engineVersion
    || input.session.scoringVersion !== input.definition.scoringVersion) {
    throw new Error('Session snapshot version does not match the authoritative task definition')
  }
  const context: PreparedAuthoritativeScorerContext<TConfig, TTrial> = {
    definition: input.definition,
    session: input.session,
    config: input.config,
    trials: validatePreparedTrialEnvelopes(input),
    randomSeed: input.randomSeed,
  }
  preparedScorerContexts.add(context)
  return context
}

export const runPreparedAuthoritativeScorer = <TConfig, TTrial>(
  context: PreparedAuthoritativeScorerContext<TConfig, TTrial>,
): CognitiveScoreResult => {
  if (!context || typeof context !== 'object' || !preparedScorerContexts.has(context)) {
    throw new Error('Prepared Cognitive scorer context must be created by the trusted preparation boundary')
  }
  const result = context.definition.scorer({
    config: context.config,
    session: context.session,
    trials: context.trials,
    randomSeed: context.randomSeed,
  })
  if (!result || typeof result !== 'object' || !result.quality || !result.metrics) {
    throw new Error('Authoritative scorer returned an invalid result')
  }
  if (result.audit.trialCount !== context.trials.length) {
    throw new Error('Authoritative scorer trialCount must match the input')
  }
  return result
}

export const runAuthoritativeScorer = <TConfig, TTrial>(input: {
  definition: TaskDefinition<TConfig, TTrial>
  session: SessionConfigSnapshot<TConfig>
  trials: unknown[]
  /** Internal legacy/final-only callers may already have parsed trial payloads. */
  preparedTrials?: TrialEnvelope<TTrial>[]
  randomSeed: string
}): CognitiveScoreResult => {
  validateSessionConfigSnapshot(input.session)
  const trials = input.preparedTrials
    ? input.preparedTrials
    : input.trials.map((trial) => validateAndNormalizeTrial({ definition: input.definition, value: trial }))
  const config = input.definition.configSchema.parse(input.session.config)
  return runPreparedAuthoritativeScorer(prepareAuthoritativeScorerContext({
    definition: input.definition,
    session: input.session,
    config,
    trials,
    randomSeed: input.randomSeed,
  }))
}
