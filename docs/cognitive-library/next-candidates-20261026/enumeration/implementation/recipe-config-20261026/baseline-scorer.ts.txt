import type { AuthoritativeScorerInput, CognitiveScoreResult, ProtocolDefinition } from '../../v2/types'
import { computeConfigSnapshotHash, computeProtocolSignature } from '../../v2/canonical'
import { parseTrialEnvelope } from '../../v2/trial-envelope'
import { parseSessionConfigSnapshot } from '../../v2/session-snapshot'
import { ENUMERATION_IDENTITY, ENUMERATION_QUANTITIES, enumerationPlan, assertEnumerationSeed,
  type EnumerationConfig, type EnumerationTrial } from './protocol'
import { parseEnumerationConfig, parseEnumerationTrial } from './schema'
export const ENUMERATION_PROTOCOL: ProtocolDefinition = {
  schemaVersion: 1, key: ENUMERATION_IDENTITY.protocolKey, version: '0.1.0', clock: 'performance',
  randomizationAlgorithmVersion: ENUMERATION_IDENTITY.randomizationAlgorithmVersion,
  trialEnvelopeVersion: 1, phases: [{ key: 'test', persists: true, required: true }],
  measurementCriticalConfigPaths: ['*'],
}
function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] + (sorted[middle] - sorted[middle - 1]) / 2
}
/** Session-only descriptive arithmetic. No timing tolerance, norm or diagnostic inference. */
export function scoreEnumeration(input: AuthoritativeScorerInput<EnumerationConfig, EnumerationTrial>): CognitiveScoreResult {
  const id = ENUMERATION_IDENTITY, config = parseEnumerationConfig(input.config)
  const session = parseSessionConfigSnapshot<EnumerationConfig>(input.session)
  assertEnumerationSeed(input.randomSeed)
  if (session.testType !== id.testType || session.engineVersion !== id.engineVersion
    || session.scoringVersion !== id.scoringVersion || session.configVersion !== id.configVersion
    || computeProtocolSignature(session.protocol) !== computeProtocolSignature(ENUMERATION_PROTOCOL)
    || session.protocolSignature !== computeProtocolSignature(ENUMERATION_PROTOCOL)
    || session.configHash !== computeConfigSnapshotHash(config)
    || computeConfigSnapshotHash(session.config) !== session.configHash)
    throw new Error('Unsupported frozen enumeration identity, protocol or config')
  if (input.trials.length > config.totalTrials) throw new Error('Enumeration formal trial budget exceeded')
  const stats = ENUMERATION_QUANTITIES.map(targetValue => ({ targetValue, observed: 0, included: 0,
    correct: 0, overReported: 0, underReported: 0, signedSum: 0, absoluteSum: 0, operationMs: [] as number[] }))
  const excludedTrialReasons: Record<string, string[]> = {}, excludedTrialIndices: number[] = []
  let previousEnd = 0
  for (let index = 0; index < input.trials.length; index++) {
    const envelope = parseTrialEnvelope<EnumerationTrial>(input.trials[index])
    const trial = parseEnumerationTrial(envelope.payload), expected = enumerationPlan(config, input.randomSeed, index)
    if (envelope.phase !== 'test' || envelope.trialIndex !== index || trial.plan.trialIndex !== index)
      throw new Error('Enumeration requires contiguous formal records, without practice')
    if ((Object.keys(expected) as Array<keyof typeof expected>).some(key => expected[key] !== trial.plan[key]))
      throw new Error('Enumeration truth does not match the frozen seed and generation order')
    if (envelope.condition !== undefined && envelope.condition !== String(expected.targetValue))
      throw new Error('Enumeration envelope condition disagrees with generated truth')
    if (envelope.startedAtPerfMs !== trial.startedAtPerfMs || envelope.endedAtPerfMs !== trial.endedAtPerfMs
      || envelope.durationMs !== trial.endedAtPerfMs - trial.startedAtPerfMs || trial.startedAtPerfMs < previousEnd)
      throw new Error('Enumeration envelope must preserve the ordered task clock')
    previousEnd = trial.endedAtPerfMs
    const facts = trial.timingFacts
    // These are explicit technical missingness/interruption facts, not literature-derived timing cutoffs.
    const reasons = [
      ...(trial.recordOrigin !== 'live' ? ['recovered_without_timing'] : []),
      ...(trial.responseValue === null ? ['missing_response'] : []),
      ...([trial.stimulusOnsetPerfMs, trial.maskOnsetPerfMs, trial.responseStartedAtPerfMs, trial.confirmedAtPerfMs]
        .some(value => value === null) ? ['missing_phase_clock'] : []),
      ...(facts.incomplete || facts.stimulusFrameCount === null || facts.maskFrameCount === null
        || facts.stimulusFrameCount === 0 || facts.maskFrameCount === 0
        || facts.stimulusMaxFrameGapMs === null || facts.maskMaxFrameGapMs === null ? ['incomplete_timing_evidence'] : []),
      ...(facts.overflow ? ['telemetry_overflow'] : []),
      ...(trial.calibrationReference === null ? ['missing_calibration_reference'] : []),
      ...(trial.renderedStimulusReference === null ? ['missing_stimulus_reference'] : []),
      ...(trial.interruptions.length || envelope.qualityEvents.length ? ['interruption'] : []),
      ...(trial.prematureInputs || envelope.flags.premature ? ['premature_input'] : []),
      ...(trial.timedOut || envelope.flags.timeout ? ['timeout'] : []),
    ]
    const condition = stats.find(row => row.targetValue === expected.targetValue)!
    condition.observed++
    if (reasons.length) {
      excludedTrialIndices.push(index); excludedTrialReasons[index] = reasons; continue
    }
    const response = trial.responseValue!, error = response - expected.targetValue
    condition.included++; condition.correct += Number(error === 0)
    condition.overReported += Number(error > 0); condition.underReported += Number(error < 0)
    condition.signedSum += error; condition.absoluteSum += Math.abs(error)
    condition.operationMs.push(trial.confirmedAtPerfMs! - trial.responseStartedAtPerfMs!)
  }
  const included = stats.reduce((sum, row) => sum + row.included, 0)
  const correct = stats.reduce((sum, row) => sum + row.correct, 0)
  const metrics = {
    reportBinding: { candidateId: id.candidateId, engineVersion: id.engineVersion,
      scoringVersion: id.scoringVersion, configVersion: id.configVersion,
      config, randomSeed: input.randomSeed, configHash: session.configHash,
      protocolSignature: session.protocolSignature },
    correctTrialCount: correct,
    overReportedTrialCount: stats.reduce((sum, row) => sum + row.overReported, 0),
    underReportedTrialCount: stats.reduce((sum, row) => sum + row.underReported, 0),
    expectedTrialCount: config.totalTrials, receivedTrialCount: input.trials.length,
    includedTrialCount: included, excludedTrialCount: excludedTrialIndices.length,
    excludedTrialIndices, excludedTrialReasons,
    byQuantity: stats.map(row => ({ targetValue: row.targetValue, expected: config.totalTrials / 5,
      observed: row.observed, included: row.included, correct: row.correct,
      overReported: row.overReported, underReported: row.underReported,
      accuracy: row.included ? row.correct / row.included : null,
      signedMeanError: row.included ? row.signedSum / row.included : null,
      meanAbsoluteError: row.included ? row.absoluteSum / row.included : null,
      medianReportOperationMs: median(row.operationMs) })),
    overallAccuracy: included ? correct / included : null,
    signedMeanError: included ? stats.reduce((sum, row) => sum + row.signedSum, 0) / included : null,
    meanAbsoluteError: included ? stats.reduce((sum, row) => sum + row.absoluteSum, 0) / included : null,
    medianReportOperationMs: median(stats.flatMap(row => row.operationMs)),
  }
  const incompleteRecords = input.trials.length !== config.totalTrials
  const technicalExclusions = excludedTrialIndices.length > 0
  const state = included === 0 ? 'invalid' : incompleteRecords || technicalExclusions ? 'limited' : 'interpretable'
  return { metrics, quality: { state, flags: {
    descriptiveOnly: true, noIncludedRecords: included === 0, incompleteRecords, technicalExclusions,
  }, reasons: included === 0 ? ['没有可用于描述本次表现的有效作答记录。']
    : [...(incompleteRecords ? ['本次记录未完成，只描述已记录的有效作答。'] : []),
      ...(technicalExclusions ? ['部分记录因中断、缺失或其他技术问题未纳入，分母已注明。'] : [])] },
  audit: { trialCount: input.trials.length, scorerVersion: id.scoringVersion } }
}
export { projectEnumerationReport } from './report'
