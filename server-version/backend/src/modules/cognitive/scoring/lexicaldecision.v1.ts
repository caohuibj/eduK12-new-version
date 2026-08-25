import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { lexicaldecisionSequence } from '../randomization'
import { LexicaldecisionConfig } from '../schemas/lexicaldecision.config'
import { LexicaldecisionTrial } from '../schemas/lexicaldecision.trial'
import { dPrime, median } from './signal-detection'

type Band = 'high' | 'medium' | 'low'

const round = (value: number): number => Number(value.toFixed(4))

export const scoreLexicaldecisionV1 = (input: {
  config: LexicaldecisionConfig
  trials: ScoringTrial<LexicaldecisionTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  if (!input.randomSeed) throw new CognitiveScoringInputError('lexicaldecision v1 requires randomSeed')
  const expected = lexicaldecisionSequence(input.randomSeed, input.config.totalTrials)
  if (input.trials.length !== expected.length) {
    throw new CognitiveScoringInputError(`lexicaldecision v1 expects exactly ${expected.length} trials, got ${input.trials.length}`)
  }

  const categoryTotals = { real: 0, pseudo: 0 }
  const categoryCorrect = { real: 0, pseudo: 0 }
  const categoryValid = { real: 0, pseudo: 0 }
  const categoryRts: Record<'real' | 'pseudo', number[]> = { real: [], pseudo: [] }
  const bandTotals: Record<Band, number> = { high: 0, medium: 0, low: 0 }
  const bandCorrect: Record<Band, number> = { high: 0, medium: 0, low: 0 }
  const responses: string[] = []
  let omissionCount = 0
  let interrupted = false

  input.trials.forEach((trial, index) => {
    if (trial.trialIndex !== index) throw new CognitiveScoringInputError('lexicaldecision v1 requires contiguous trialIndex values')
    const spec = expected[index]
    const payload = trial.payload
    if (
      payload.stimulusId !== spec.stimulusId
      || payload.stimulusVersion !== spec.stimulusVersion
      || payload.lexicality !== spec.lexicality
      || payload.wordLength !== spec.wordLength
      || payload.frequencyBand !== spec.frequencyBand
      || payload.pseudowordGeneratorVersion !== spec.pseudowordGeneratorVersion
    ) {
      throw new CognitiveScoringInputError(`lexicaldecision v1 trial ${index} metadata does not match the frozen stimulus`)
    }
    categoryTotals[spec.lexicality] += 1
    bandTotals[spec.frequencyBand] += 1
    interrupted ||= payload.interrupted
    const valid = payload.response !== null
      && payload.rtMs !== null
      && payload.rtMs >= input.config.validRtFloorMs
      && payload.rtMs <= input.config.trialTimeoutMs
    if (!valid) {
      omissionCount += 1
      return
    }
    categoryValid[spec.lexicality] += 1
    categoryRts[spec.lexicality].push(payload.rtMs as number)
    responses.push(payload.response as string)
    const correct = (spec.lexicality === 'real' && payload.response === 'word')
      || (spec.lexicality === 'pseudo' && payload.response === 'nonword')
    if (correct) {
      categoryCorrect[spec.lexicality] += 1
      bandCorrect[spec.frequencyBand] += 1
    }
  })

  const accuracyReal = categoryCorrect.real / categoryTotals.real
  const accuracyPseudo = categoryCorrect.pseudo / categoryTotals.pseudo
  const balancedAccuracy = (accuracyReal + accuracyPseudo) / 2
  const dPrimeValue = dPrime(
    categoryCorrect.real,
    categoryTotals.real,
    categoryValid.pseudo - categoryCorrect.pseudo,
    categoryTotals.pseudo,
  )
  const realMedian = median(categoryRts.real)
  const pseudoMedian = median(categoryRts.pseudo)
  const lexicalityEffectMs = realMedian == null || pseudoMedian == null ? null : pseudoMedian - realMedian
  const omissionRate = omissionCount / input.config.totalTrials
  const constantResponse = responses.length >= 8 && new Set(responses).size === 1
  const insufficientRealWords = categoryValid.real < Math.ceil(categoryTotals.real * 0.7)
  const insufficientPseudoWords = categoryValid.pseudo < Math.ceil(categoryTotals.pseudo * 0.7)
  const lowAccuracy = balancedAccuracy < 0.5
  const excessiveOmissions = omissionRate >= 0.3

  return {
    score: Math.round(balancedAccuracy * 100),
    metrics: {
      dPrime: round(dPrimeValue),
      lexicalityEffectMs,
      accuracyReal: round(accuracyReal),
      accuracyPseudo: round(accuracyPseudo),
      medianRtReal: realMedian,
      medianRtPseudo: pseudoMedian,
      accuracyByFrequencyBand: Object.fromEntries((Object.keys(bandTotals) as Band[]).map((band) => [band, round(bandTotals[band] === 0 ? 0 : bandCorrect[band] / bandTotals[band])])),
      omissionRate: round(omissionRate),
      validResponseCount: categoryValid.real + categoryValid.pseudo,
    },
    qualityFlags: {
      interpretable: !insufficientRealWords && !insufficientPseudoWords && !lowAccuracy && !excessiveOmissions && !constantResponse && !interrupted,
      insufficientRealWords,
      insufficientPseudoWords,
      lowAccuracy,
      excessiveOmissions,
      constantResponse,
      interrupted,
    },
  }
}
