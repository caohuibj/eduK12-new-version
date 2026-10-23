import type { AuthoritativeScorer } from '../../v2/types'
import { simonConfigSchema, simonTrialSchema, type SimonConfig, type SimonTrial } from './schema'
import { parseTrialEnvelope } from '../../v2/trial-envelope'
import { simonSequence } from './sequence'
const mean = (values: number[]): number | null => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
/** Descriptive accuracy includes wrong/timeout responses, but excludes interruptions.
 * Correct RT: 0 < RT < 2000 ms. No trimming, imputation, norms or index score. */
export const scoreSimon: AuthoritativeScorer<SimonConfig, SimonTrial> = ({ config, trials, randomSeed }) => {
  simonConfigSchema.parse(config)
  if (trials.length > config.totalTrials) throw new Error('Simon trial count exceeds frozen protocol')
  const expected = simonSequence(randomSeed, config.totalTrials)
  const rows = trials.map((envelope, i) => {
    parseTrialEnvelope(envelope)
    const t = simonTrialSchema.parse(envelope.payload), e = expected[i]
    if (envelope.flags.timeout !== t.timeout) throw new Error('Simon timeout flag mismatch')
    if (envelope.phase !== 'test' || envelope.trialIndex !== i) throw new Error('Simon requires ordered formal trials')
    for (const key of ['color', 'stimulusSide', 'requiredSide', 'mapping'] as const) if (t[key] !== e[key]) throw new Error('Simon seed reconstruction mismatch: ' + key)
    if (t.timing.isiMs !== e.isiMs) throw new Error('Simon ISI seed mismatch')
    if (envelope.endedAtPerfMs !== t.timing.windowEndPerfMs || envelope.startedAtPerfMs !== (t.timing.onsetPerfMs ?? t.timing.windowEndPerfMs)) throw new Error('Simon timing envelope mismatch')
    const condition = e.requiredSide === e.stimulusSide ? 'congruent' : 'incongruent'
    if (envelope.condition !== condition) throw new Error('Simon condition mismatch')
    const interrupted = t.interrupted || envelope.qualityEvents.length > 0 || envelope.durationMs < config.responseWindowMs || (t.timing.onsetPerfMs === null || t.timing.windowEndPerfMs - t.timing.onsetPerfMs < config.responseWindowMs)
    const correct = !t.timeout && t.responseSide === e.requiredSide
    const valid = !interrupted && correct && t.rtMs !== null && t.rtMs > 0 && t.rtMs < config.responseWindowMs
    return { t, condition, interrupted, correct, valid }
  })
  const usable = rows.filter(r => !r.interrupted)
  const congruent = rows.filter(r => r.valid && r.condition === 'congruent').map(r => r.t.rtMs!)
  const incongruent = rows.filter(r => r.valid && r.condition === 'incongruent').map(r => r.t.rtMs!)
  const congruentMeanRtMs = mean(congruent), incongruentMeanRtMs = mean(incongruent)
  const conditionStats = (condition: string) => {
    const all = rows.filter(r => r.condition === condition), technical = all.filter(r => !r.interrupted)
    const values = technical.filter(r => r.valid).map(r => r.t.rtMs!).sort((a, b) => a - b)
    return { trialCount: all.length, technicalValidCount: technical.length, validRtCount: values.length, meanRtMs: mean(values), medianRtMs: values.length ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2 : null, accuracy: technical.length ? technical.filter(r => r.correct).length / technical.length : null, errorRate: technical.length ? technical.filter(r => !r.correct && !r.t.timeout).length / technical.length : null, omissionRate: technical.length ? technical.filter(r => r.t.timeout).length / technical.length : null, interruptedCount: all.length - technical.length }
  }
  const congruentStats = conditionStats('congruent'), incongruentStats = conditionStats('incongruent')
  const flags = { incomplete: rows.length !== config.totalTrials, interrupted: rows.some(r => r.interrupted), noValidRt: !congruent.length && !incongruent.length, missingCondition: !congruent.length || !incongruent.length }
  return { metrics: { conditions: { congruent: congruentStats, incongruent: incongruentStats }, accuracyCostRatio: congruentStats.accuracy === null || incongruentStats.accuracy === null ? null : congruentStats.accuracy - incongruentStats.accuracy, totalTrials: rows.length, validTrialCount: congruent.length + incongruent.length, accuracy: usable.length ? usable.filter(r => r.correct).length / usable.length : null, meanRtMs: mean([...congruent, ...incongruent]), congruentMeanRtMs, incongruentMeanRtMs, simonEffectMeanMs: congruentMeanRtMs === null || incongruentMeanRtMs === null ? null : incongruentMeanRtMs - congruentMeanRtMs, congruentValidCount: congruent.length, incongruentValidCount: incongruent.length, timeoutCount: rows.filter(r => r.t.timeout).length, interruptedCount: rows.filter(r => r.interrupted).length }, quality: { state: flags.incomplete || flags.noValidRt ? 'invalid' : flags.interrupted || flags.missingCondition ? 'limited' : 'interpretable', flags, reasons: Object.entries(flags).filter(([, active]) => active).map(([key]) => key) }, audit: { trialCount: rows.length, scorerVersion: '1.0.0' } }
}
