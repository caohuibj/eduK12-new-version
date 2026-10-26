import { describe, expect, it } from 'vitest'
import { runAuthoritativeScorer } from '../../modules/cognitive/v2/authoritative-scorer'
import { computeConfigSnapshotHash, computeProtocolSignature } from '../../modules/cognitive/v2/canonical'
import type { CognitiveScoreResult, TrialEnvelope } from '../../modules/cognitive/v2/types'
import { createEnumerationSnapshot, enumerationDefinition, enumerationTrialEnvelope,
  projectEnumerationReport, enumerationContent } from '../../modules/cognitive/content-candidates/enumeration/package'
import { ENUMERATION_IDENTITY, enumerationConfig, enumerationPlan, enumerationSequence,
  type EnumerationProfile, type EnumerationTrial } from '../../modules/cognitive/content-candidates/enumeration/protocol'
import { parseEnumerationConfig, parseEnumerationTrial } from '../../modules/cognitive/content-candidates/enumeration/schema'
import { scoreEnumeration } from '../../modules/cognitive/content-candidates/enumeration/scorer'

const seed = 'enumeration-golden-中文-20261026'
/** All timings, recipe/calibration refs and frame counts below are synthetic contract fixtures, not validation evidence. */
function fixture(profile: EnumerationProfile = 'experience', useSeed = seed): TrialEnvelope<EnumerationTrial>[] {
  return enumerationSequence(enumerationConfig(profile), useSeed).map(plan => {
    const start = plan.trialIndex * 10000
    return enumerationTrialEnvelope({ phase: 'test', plan, recordOrigin: 'live', startedAtPerfMs: start,
      stimulusOnsetPerfMs: start + 1000, maskOnsetPerfMs: start + 1050,
      responseStartedAtPerfMs: start + 2050, confirmedAtPerfMs: start + 2250, endedAtPerfMs: start + 2300,
      responseValue: plan.targetValue, responseInput: 'touch',
      sliderChanges: [{ value: plan.targetValue, atPerfMs: start + 2150, input: 'touch' }],
      prematureInputs: 0, timedOut: false, interruptions: [],
      timingFacts: { source: 'client_reported', stimulusFrameCount: 3, maskFrameCount: 60,
        stimulusMaxFrameGapMs: 16.7, maskMaxFrameGapMs: 16.7, incomplete: false, overflow: false },
      calibrationReference: 'synthetic:uncalibrated', renderedStimulusReference: 'synthetic:not-real-stimuli' })
  })
}
const score = (trials: unknown[], profile: EnumerationProfile = 'experience', randomSeed = seed) =>
  runAuthoritativeScorer({ definition: enumerationDefinition, session: createEnumerationSnapshot(profile), trials, randomSeed })
const setAnswer = (trial: EnumerationTrial, value: number) => {
  trial.responseValue = value; trial.sliderChanges = [{ value, atPerfMs: trial.responseStartedAtPerfMs! + 50, input: 'pointer' }]
  trial.responseInput = 'pointer'
}
const rows = (result: CognitiveScoreResult) => result.metrics.byQuantity as Array<{
  targetValue: number; expected: number; observed: number; included: number; correct: number;
  accuracy: number | null; signedMeanError: number | null; meanAbsoluteError: number | null;
  medianReportOperationMs: number | null
}>

describe('enumeration internal pure logic candidate', () => {
  it('uses real native identities and explicit frozen config/protocol hashes without a fabricated score or norm', () => {
    const research = createEnumerationSnapshot('research'), experience = createEnumerationSnapshot('experience')
    expect(research.testType).toBe('enumeration')
    expect(research.configVersion).toBe('0.1.0')
    expect(research.configHash).not.toBe(experience.configHash)
    expect(research.protocolSignature).toBe(experience.protocolSignature)
    expect(Object.keys(enumerationDefinition.profiles)).toEqual(['research', 'experience'])
    expect(enumerationDefinition.references).toEqual([])
    expect(enumerationDefinition.report.headlineMetrics).toEqual([])
    expect(enumerationContent.approval.formalCounts).toEqual({ research: 100, experience: 25 })
    expect(enumerationContent.extensions.age.min).toBeNull()
    expect(Object.keys(enumerationContent.inheritedResearchTags)).toHaveLength(18)
    expect(enumerationConfig('experience').minimumValidPerCondition).toBeNull()
    expect(enumerationConfig('research').timingToleranceMs).toBeNull()
  })
  it.each(['research', 'experience'] as const)('balances all five quantities in every %s block with deterministic replay', profile => {
    const config = enumerationConfig(profile), first = enumerationSequence(config, seed)
    expect(first).toEqual(enumerationSequence(JSON.parse(JSON.stringify(config)), seed))
    expect(first).toHaveLength(profile === 'research' ? 100 : 25)
    for (let block = 0; block < config.blocks; block++) {
      const items = first.filter(plan => plan.blockIndex === block)
      expect(items).toHaveLength(25)
      for (const q of [5, 6, 7, 8, 9]) expect(items.filter(plan => plan.targetValue === q)).toHaveLength(5)
      expect(items.map(plan => plan.positionInBlock)).toEqual(Array.from({ length: 25 }, (_, i) => i))
    }
    expect(first.every(plan => Number.isInteger(plan.sliderInitialValue) && plan.sliderInitialValue >= 1 && plan.sliderInitialValue <= 15)).toBe(true)
    expect(new Set(first.map(plan => plan.sliderInitialValue)).size).toBeGreaterThan(1)
    expect(first).not.toEqual(enumerationSequence(config, seed + 'different'))
  })
  it('pins the versioned first formal block against an independent unsigned-integer reference', () => {
    const plans = enumerationSequence(enumerationConfig('experience'), seed)
    expect(plans.map(plan => plan.targetValue)).toEqual([9, 5, 6, 5, 8, 7, 5, 6, 8, 9, 7, 7, 6, 9, 5, 7, 8, 9, 6, 8, 6, 8, 9, 7, 5])
    expect(plans.map(plan => plan.sliderInitialValue)).toEqual([10, 7, 10, 3, 10, 10, 3, 5, 5, 3, 3, 8, 3, 13, 10, 11, 7, 12, 6, 6, 15, 13, 1, 8, 6])
  })
  it('separates practice generation/repetition from formal order, and never narrows the 1–15 answer range', () => {
    const config = enumerationConfig('research'), before = enumerationSequence(config, seed)
    for (let i = 0; i < 4; i++)
      expect(enumerationSequence(config, seed, 'practice').map(plan => plan.targetValue)).toEqual([3, 4, 5])
    expect(enumerationSequence(config, seed)).toEqual(before)
    expect(enumerationSequence(enumerationConfig('experience'), seed)).toEqual(before.slice(0, 25))
    expect(() => enumerationPlan(config, seed, 3, 'practice')).toThrow()
    expect(() => enumerationPlan(config, seed, -1)).toThrow()
    expect(() => enumerationPlan(config, seed, 1.5)).toThrow()
    expect(() => enumerationPlan(config, '', 0)).toThrow()
    expect(() => enumerationPlan(config, 'x'.repeat(257), 0)).toThrow()
  })
  it.each(['research', 'experience'] as const)('computes independently known exact-match golden arithmetic for %s but keeps every report closed', profile => {
    const result = score(fixture(profile), profile), n = profile === 'research' ? 100 : 25
    expect(result.metrics.includedTrialCount).toBe(n)
    expect(result.metrics.overallAccuracy).toBe(1)
    expect(result.metrics.signedMeanError).toBe(0)
    expect(result.metrics.meanAbsoluteError).toBe(0)
    expect(result.metrics.medianReportOperationMs).toBe(200)
    for (const row of rows(result)) expect(row).toMatchObject({ expected: n / 5, observed: n / 5, included: n / 5, correct: n / 5, accuracy: 1 })
    expect(result).not.toHaveProperty('score')
    expect(result.quality.state).toBe('invalid')
    expect(result.quality.flags.protocolValidationPending).toBe(true)
    expect(projectEnumerationReport(result)).toMatchObject({ state: 'invalid', headline: null, rows: [] })
  })
  it('preserves negative signed error, real zero accuracy and both end responses', () => {
    const trials = fixture()
    trials.forEach(envelope => setAnswer(envelope.payload, envelope.payload.plan.targetValue - 1))
    const result = score(trials)
    expect(result.metrics.overallAccuracy).toBe(0)
    expect(result.metrics.signedMeanError).toBe(-1)
    expect(result.metrics.meanAbsoluteError).toBe(1)
    setAnswer(trials[0].payload, 1); setAnswer(trials[1].payload, 15)
    expect(() => score(trials)).not.toThrow()
  })
  it('keeps explicit null denominators for empty records and all-excluded records', () => {
    for (const trials of [[], fixture().map(envelope => {
      envelope.payload.timingFacts.incomplete = true; return envelope
    })]) {
      const result = score(trials)
      expect(result.metrics.includedTrialCount).toBe(0)
      expect(result.metrics.overallAccuracy).toBeNull()
      expect(result.metrics.signedMeanError).toBeNull()
      expect(result.metrics.medianReportOperationMs).toBeNull()
      expect(rows(result).every(row => row.included === 0 && row.accuracy === null && row.signedMeanError === null)).toBe(true)
      expect(result.quality.flags.noIncludedRecords).toBe(true)
    }
  })
  it('keeps received/missing/excluded denominators distinct and never invents a minimum valid N', () => {
    const result = score(fixture().slice(0, 1))
    expect(result.metrics.receivedTrialCount).toBe(1)
    expect(result.metrics.expectedTrialCount).toBe(25)
    expect(result.metrics.includedTrialCount).toBe(1)
    expect(result.metrics.excludedTrialCount).toBe(0)
    expect(result.quality.flags.incompleteRecords).toBe(true)
    expect(rows(result).filter(row => row.accuracy === null)).toHaveLength(4)
    expect(projectEnumerationReport(result).rows).toEqual([])
  })
  it('excludes factual timeout, premature input, interruption, recovery and incomplete evidence while retaining raw records', () => {
    const trials = fixture()
    trials[0].payload.timedOut = true
    trials[1].payload.prematureInputs = 1
    trials[2].qualityEvents = ['window_blur']
    trials[3].payload.recordOrigin = 'recovered_without_timing'
    trials[4].payload.calibrationReference = null
    trials[5].payload.renderedStimulusReference = null
    trials[6].payload.timingFacts.overflow = true
    trials[7].payload.timingFacts.stimulusFrameCount = 0
    const unchanged = JSON.stringify(trials), result = score(trials)
    expect(result.metrics.includedTrialCount).toBe(17)
    expect(result.metrics.excludedTrialCount).toBe(8)
    expect(result.metrics.excludedTrialIndices).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(result.metrics.excludedTrialReasons).toMatchObject({ 0: ['timeout'], 1: ['premature_input'], 2: ['interruption'] })
    expect(JSON.stringify(trials)).toBe(unchanged)
  })
  it('represents unanswered and incomplete clock records as null/excluded rather than fake zeros', () => {
    const trials = fixture()
    Object.assign(trials[0].payload, { responseValue: null, confirmedAtPerfMs: null, responseInput: null, sliderChanges: [] })
    trials[1].payload.maskOnsetPerfMs = null
    const result = score(trials)
    expect(result.metrics.excludedTrialCount).toBe(2)
    expect(result.metrics.excludedTrialReasons).toMatchObject({ 0: ['missing_response', 'missing_phase_clock'], 1: ['missing_phase_clock'] })
  })
  it.each([NaN, Infinity, -Infinity])('rejects non-finite raw facts (%s), even on direct scorer input', value => {
    const trials = fixture()
    trials[0].payload.timingFacts.stimulusMaxFrameGapMs = value
    expect(() => score(trials)).toThrow()
    expect(() => scoreEnumeration({ config: enumerationConfig('experience'), session: createEnumerationSnapshot('experience'), trials, randomSeed: seed })).toThrow()
  })
  it('rejects illegal, fractional, missing-confirm and mismatched slider records', () => {
    for (const value of [0, 16, 6.5]) {
      const trial = fixture()[0].payload; setAnswer(trial, value)
      expect(() => parseEnumerationTrial(trial)).toThrow()
    }
    const trial = fixture()[0].payload
    trial.responseValue = trial.responseValue === 5 ? 6 : 5
    expect(() => parseEnumerationTrial(trial)).toThrow(/slider/)
    trial.responseValue = trial.sliderChanges[0].value; trial.confirmedAtPerfMs = null
    expect(() => parseEnumerationTrial(trial)).toThrow()
  })
  it('rejects seed/algorithm/truth/slider-initial tampering independently', () => {
    expect(() => score(fixture(), 'experience', seed + ':wrong')).toThrow(/seed/)
    for (const mutate of [
      (t: EnumerationTrial) => { t.plan.targetValue = t.plan.targetValue === 5 ? 6 : 5 },
      (t: EnumerationTrial) => { t.plan.sliderInitialValue = t.plan.sliderInitialValue === 1 ? 2 : 1 },
      (t: EnumerationTrial) => { t.plan.sequenceSeed += ':wrong' },
      (t: EnumerationTrial) => { t.plan.blockIndex = 1 },
    ]) {
      const trials = fixture(); mutate(trials[0].payload)
      expect(() => score(trials)).toThrow(/seed/)
    }
    const trials = fixture()
    ;(trials[0].payload.plan as unknown as Record<string, unknown>).randomizationAlgorithmVersion = 'latest'
    expect(() => score(trials)).toThrow()
  })
  it('rejects reordered, duplicate, skipped, over-budget and practice-contaminated records', () => {
    const trials = fixture()
    expect(() => score([trials[1], trials[0]])).toThrow()
    expect(() => score([trials[0], trials[0]])).toThrow()
    expect(() => score([trials[0], trials[2]])).toThrow()
    expect(() => score(fixture('research').slice(0, 26))).toThrow(/budget/)
    const practice = structuredClone(trials[0])
    ;(practice.payload as unknown as { phase: string }).phase = 'practice'
    expect(() => score([practice])).toThrow()
  })
  it('rejects reversed phase/slider/envelope clocks and session clock restart', () => {
    const trials = fixture()
    trials[0].payload.maskOnsetPerfMs = 999
    expect(() => score(trials)).toThrow(/clock/)
    const slider = fixture(); slider[0].payload.sliderChanges[0].atPerfMs = 999
    expect(() => score(slider)).toThrow(/clock/)
    const drift = fixture(); drift[0].endedAtPerfMs += 1; drift[0].durationMs += 1
    expect(() => score(drift)).toThrow(/clock/)
    const restarted = fixture()
    restarted[1].payload.startedAtPerfMs = 0; restarted[1].startedAtPerfMs = 0
    restarted[1].durationMs = restarted[1].endedAtPerfMs
    expect(() => score(restarted)).toThrow(/clock/)
  })
  it('replays a serialized freeze exactly, and rejects config/profile/protocol/version/hash incompatibility', () => {
    const session = createEnumerationSnapshot('experience'), trials = fixture()
    const replay = () => runAuthoritativeScorer({ definition: enumerationDefinition,
      session: JSON.parse(JSON.stringify(session)), trials: JSON.parse(JSON.stringify(trials)), randomSeed: seed })
    expect(replay()).toEqual(score(trials))
    const corruptHash = structuredClone(session); corruptHash.configHash = '0'.repeat(64)
    expect(() => runAuthoritativeScorer({ definition: enumerationDefinition, session: corruptHash, trials, randomSeed: seed })).toThrow(/hash/)
    for (const key of ['testType', 'engineVersion', 'scoringVersion', 'configVersion'] as const) {
      const changed = structuredClone(session); changed[key] = 'incompatible'
      expect(() => runAuthoritativeScorer({ definition: enumerationDefinition, session: changed, trials, randomSeed: seed })).toThrow()
    }
    const protocol = structuredClone(session); protocol.protocol.version = '9.0.0'
    protocol.protocolSignature = computeProtocolSignature(protocol.protocol)
    expect(() => runAuthoritativeScorer({ definition: enumerationDefinition, session: protocol, trials, randomSeed: seed })).toThrow(/protocol/)
    const mismatch = structuredClone(session); mismatch.config.totalTrials = 100
    mismatch.configHash = computeConfigSnapshotHash(mismatch.config)
    expect(() => runAuthoritativeScorer({ definition: enumerationDefinition, session: mismatch, trials, randomSeed: seed })).toThrow(/tuple/)
    expect(() => scoreEnumeration({ config: enumerationConfig('research'), session, trials, randomSeed: seed })).toThrow(/config/)
  })
  it('rejects threshold or stimulus-policy injection instead of treating it as an approved contract', () => {
    expect(() => parseEnumerationConfig({ ...enumerationConfig('experience'), minimumValidPerCondition: 1 })).toThrow()
    expect(() => parseEnumerationConfig({ ...enumerationConfig('experience'), timingToleranceMs: 50 })).toThrow()
    expect(() => parseEnumerationConfig({ ...enumerationConfig('experience'), stimulusRecipe: 'paper5deg' })).toThrow()
    expect(() => parseEnumerationConfig({ ...enumerationConfig('experience'), allowIndividualConclusions: true })).toThrow()
  })
  it('fails closed if a caller forges interpretable/limited flags or supplies diagnostic metrics', () => {
    for (const state of ['interpretable', 'limited', 'invalid'] as const) {
      const report = projectEnumerationReport({ quality: { state, flags: {}, reasons: [] },
        metrics: { overallAccuracy: 1, signedMeanError: -2, byQuantity: [{ accuracy: 1, included: 100 }] } })
      expect(report).toMatchObject({ state: 'invalid', headline: null, rows: [], interpretationPolicy: 'research_provisional' })
      expect(report).not.toHaveProperty('metrics')
    }
    for (const metric of Object.values(enumerationDefinition.metrics)) {
      expect(metric.visibility).toBe('research_only')
      expect(metric.referenceEligible).toBe(false)
      expect(metric.export.summary).toBe(false)
    }
    expect(ENUMERATION_IDENTITY.candidateId).toBe('attention-enumeration-flower')
  })
})
