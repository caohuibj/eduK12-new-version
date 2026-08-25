import { describe, expect, it } from 'vitest'
import { listCognitiveTestsCatalog } from '../../modules/cognitive/catalog.service'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { mergeProfileConfig } from '../../modules/cognitive/profile-freeze'
import { buildCognitiveResearchPackage } from '../../modules/cognitive/export.service'
import { buildCognitiveSingleTaskReport } from '../../modules/cognitive/single-task-report'
import { wordlistConfigSchema } from '../../modules/cognitive/schemas/wordlist.config'
import { wordlistTrialSchema } from '../../modules/cognitive/schemas/wordlist.trial'
import { lexicaldecisionConfigSchema } from '../../modules/cognitive/schemas/lexicaldecision.config'
import { lexicaldecisionTrialSchema } from '../../modules/cognitive/schemas/lexicaldecision.trial'
import { emotionrecognitionConfigSchema } from '../../modules/cognitive/schemas/emotionrecognition.config'
import { emotionrecognitionTrialSchema } from '../../modules/cognitive/schemas/emotionrecognition.trial'
import { scoreWordlistV1 } from '../../modules/cognitive/scoring/wordlist.v1'
import { scoreLexicaldecisionV1 } from '../../modules/cognitive/scoring/lexicaldecision.v1'
import { scoreEmotionrecognitionV1 } from '../../modules/cognitive/scoring/emotionrecognition.v1'
import { emotionrecognitionSequence, lexicaldecisionSequence, wordlistSequence } from '../../modules/cognitive/randomization'
import { LEXICAL_PSEUDO_BANK, LEXICAL_REAL_BANK } from '../../modules/cognitive/pr13-stimuli'
import { listAnalysisProtocolDefinitions, listReportPackageDefinitions } from '../../modules/cognitive-analysis'

const REPORT = { reportVersion: '1.0.0', referenceMode: 'none' as const }

const wordlistConfig = wordlistConfigSchema.parse({
  listLength: 12,
  learningRounds: 3,
  delayedEnabled: false,
  delayedDelayMs: 60000,
  studyMsPerWord: 800,
  recallTimeoutMs: 60000,
  inactivityGuardMs: 120000,
  inputMode: 'typed-free-recall',
  normalizationVersion: 'wordlist-normalization-v1.0.0',
  stimulusSetVersion: 'chinese-wordlist-v1.0.0',
  report: REPORT,
})

const lexicaldecisionConfig = lexicaldecisionConfigSchema.parse({
  totalTrials: 40,
  realWordRatio: 0.5,
  stimulusMs: 1200,
  trialTimeoutMs: 3000,
  isiMs: 300,
  validRtFloorMs: 150,
  stimulusSetVersion: 'zh-lexical-v1.0.0',
  pseudowordGeneratorVersion: 'zh-pseudoword-generator-v1.0.0',
  report: REPORT,
})

const emotionConfig = emotionrecognitionConfigSchema.parse({
  totalTrials: 24,
  stimulusMs: 3000,
  trialTimeoutMs: 5000,
  isiMs: 300,
  validRtFloorMs: 200,
  emotionCategoryVersion: 'basic-emotion-6-v1.0.0',
  stimulusSetVersion: 'emotion-faces-ai-zh-v1.0.0',
  report: REPORT,
})

describe('PR13 cognitive task contracts', () => {
  it('rejects unknown fields and client-derived conditions/outcomes', () => {
    expect(wordlistConfigSchema.safeParse({ ...wordlistConfig, phase: 'delayed' }).success).toBe(false)
    expect(wordlistTrialSchema.safeParse({ listId: 'wordlist-01', stimulusSetVersion: 'chinese-wordlist-v1.0.0', responses: [], responseDurationMs: 100, interrupted: false, phase: 'immediate' }).success).toBe(false)
    expect(lexicaldecisionConfigSchema.safeParse({ ...lexicaldecisionConfig, frequencyBand: 'high' }).success).toBe(false)
    expect(lexicaldecisionTrialSchema.safeParse({ stimulusId: 'zh-real-2-high-001', stimulusVersion: 'zh-lexical-v1.0.0', lexicality: 'real', wordLength: 2, frequencyBand: 'high', pseudowordGeneratorVersion: 'zh-pseudoword-generator-v1.0.0', response: 'word', rtMs: 300, interrupted: false, correct: true }).success).toBe(false)
    expect(emotionrecognitionConfigSchema.safeParse({ ...emotionConfig, expectedEmotion: 'happy' }).success).toBe(false)
    expect(emotionrecognitionTrialSchema.safeParse({ stimulusId: 'emotion-identity-01-happy', stimulusVersion: 'emotion-faces-ai-zh-v1.0.0', responseEmotion: 'happy', rtMs: 300, interrupted: false, expectedEmotion: 'happy' }).success).toBe(false)
  })

  it('merges the three profile patches into schema-valid frozen configs', () => {
    const cases = [
      ['wordlist', wordlistConfig, { experience: { listLength: 8, learningRounds: 2, delayedEnabled: false }, standard: { listLength: 12, learningRounds: 3 }, research: { listLength: 15, learningRounds: 5, delayedEnabled: true } }],
      ['lexicaldecision', lexicaldecisionConfig, { experience: { totalTrials: 40 }, standard: { totalTrials: 100 }, research: { totalTrials: 200 } }],
      ['emotionrecognition', emotionConfig, { experience: { totalTrials: 24 }, standard: { totalTrials: 60 }, research: { totalTrials: 120 } }],
    ] as const
    for (const [testType, baseConfig, expected] of cases) {
      const entry = getCognitiveRegistryEntry(testType, '1.0.0', '1.0.0')
      expect(entry).toBeDefined()
      for (const profile of ['experience', 'standard', 'research'] as const) {
        const resolved = mergeProfileConfig(entry as never, baseConfig, profile) as Record<string, unknown>
        expect(resolved).toMatchObject(expected[profile])
        expect(entry?.configSchema.safeParse(resolved).success).toBe(true)
      }
    }
  })

  it('replays independent deterministic sequences and changes them for another seed', () => {
    expect(LEXICAL_REAL_BANK).toHaveLength(180)
    expect(LEXICAL_PSEUDO_BANK).toHaveLength(180)
    expect(new Set(LEXICAL_REAL_BANK.map((item) => item.text)).size).toBe(180)
    expect(new Set(LEXICAL_PSEUDO_BANK.map((item) => item.text)).size).toBe(180)
    expect(LEXICAL_REAL_BANK.every((item) => item.text.length === item.wordLength)).toBe(true)
    expect(LEXICAL_PSEUDO_BANK.every((item) => item.text.length === item.wordLength)).toBe(true)
    expect(wordlistSequence('pr13-a', 12, 3, false)).toEqual(wordlistSequence('pr13-a', 12, 3, false))
    expect(wordlistSequence('pr13-a', 12, 3, false)).not.toEqual(wordlistSequence('pr13-b', 12, 3, false))
    expect(lexicaldecisionSequence('pr13-a', 40)).toEqual(lexicaldecisionSequence('pr13-a', 40))
    expect(lexicaldecisionSequence('pr13-a', 40)).not.toEqual(lexicaldecisionSequence('pr13-b', 40))
    expect(emotionrecognitionSequence('pr13-a', 24, 4)).toEqual(emotionrecognitionSequence('pr13-a', 24, 4))
    expect(emotionrecognitionSequence('pr13-a', 24, 4)).not.toEqual(emotionrecognitionSequence('pr13-b', 24, 4))
  })

  it('scores Wordlist from replayed stages, preserves delayed null, and detects recall anomalies', () => {
    const seed = 'wordlist-golden'
    const sequence = wordlistSequence(seed, wordlistConfig.listLength, wordlistConfig.learningRounds, wordlistConfig.delayedEnabled)
    const trials = sequence.map((stage, trialIndex) => ({ trialIndex, payload: wordlistTrialSchema.parse({ listId: stage.listId, stimulusSetVersion: stage.stimulusSetVersion, responses: stage.words, responseDurationMs: 1000, interrupted: false }) }))
    const result = scoreWordlistV1({ config: wordlistConfig, trials, randomSeed: seed })
    expect(result.metrics).toMatchObject({ immediateAccuracy: 1, learningGain: 0, totalImmediateCorrect: 36, omissionRate: 0, delayedRecallAccuracy: null })
    expect(result.qualityFlags.interpretable).toBe(true)

    const repeated = trials.map((trial) => ({ ...trial, payload: wordlistTrialSchema.parse({ ...trial.payload, responses: Array(8).fill('未知词') }) }))
    const repeatedResult = scoreWordlistV1({ config: wordlistConfig, trials: repeated, randomSeed: seed })
    expect(repeatedResult.qualityFlags.repeatedResponsePattern).toBe(true)
    expect(repeatedResult.qualityFlags.excessiveIntrusions).toBe(true)
    const emptyRound = trials.map((trial, index) => index === 0 ? { ...trial, payload: wordlistTrialSchema.parse({ ...trial.payload, responses: [] }) } : trial)
    expect(scoreWordlistV1({ config: wordlistConfig, trials: emptyRound, randomSeed: seed }).qualityFlags.emptyImmediateRecall).toBe(true)
    expect(() => scoreWordlistV1({ config: wordlistConfig, trials: trials.slice(0, -1), randomSeed: seed })).toThrow()
    expect(() => scoreWordlistV1({ config: wordlistConfig, trials: trials.map((trial, index) => index === 0 ? { ...trial, payload: wordlistTrialSchema.parse({ ...trial.payload, listId: 'wordlist-99' }) } : trial), randomSeed: seed })).toThrow()

    const delayedConfig = wordlistConfigSchema.parse({ ...wordlistConfig, listLength: 8, learningRounds: 2, delayedEnabled: true })
    const delayedSequence = wordlistSequence(seed, 8, 2, true)
    const delayedTrials = delayedSequence.map((stage, trialIndex) => ({ trialIndex, payload: wordlistTrialSchema.parse({ listId: stage.listId, stimulusSetVersion: stage.stimulusSetVersion, responses: stage.phase === 'delayed' ? [] : stage.words, responseDurationMs: 1000, interrupted: stage.phase === 'delayed' }) }))
    const delayedResult = scoreWordlistV1({ config: delayedConfig, trials: delayedTrials, randomSeed: seed })
    expect(delayedResult.metrics.delayedRecallAccuracy).toBeNull()
    expect(delayedResult.metrics.immediateAccuracy).toBe(1)
    expect(delayedResult.metrics.omissionRate).toBe(0)
    expect(delayedResult.qualityFlags.delayedStageIncomplete).toBe(true)
  })

  it('scores Lexical Decision from verified metadata and applies omission/constant gates', () => {
    const seed = 'lexical-golden'
    const sequence = lexicaldecisionSequence(seed, lexicaldecisionConfig.totalTrials)
    const trials = sequence.map((item, trialIndex) => ({ trialIndex, payload: lexicaldecisionTrialSchema.parse({ stimulusId: item.stimulusId, stimulusVersion: item.stimulusVersion, lexicality: item.lexicality, wordLength: item.wordLength, frequencyBand: item.frequencyBand, pseudowordGeneratorVersion: item.pseudowordGeneratorVersion, response: item.lexicality === 'real' ? 'word' : 'nonword', rtMs: 300, interrupted: false }) }))
    const result = scoreLexicaldecisionV1({ config: lexicaldecisionConfig, trials, randomSeed: seed })
    expect(result.metrics).toMatchObject({ accuracyReal: 1, accuracyPseudo: 1, omissionRate: 0, validResponseCount: 40 })
    expect(result.qualityFlags.interpretable).toBe(true)
    const constant = trials.map((trial) => ({ ...trial, payload: lexicaldecisionTrialSchema.parse({ ...trial.payload, response: 'word', rtMs: 300 }) }))
    const constantResult = scoreLexicaldecisionV1({ config: lexicaldecisionConfig, trials: constant, randomSeed: seed })
    expect(constantResult.qualityFlags.constantResponse).toBe(true)
    expect(constantResult.metrics.dPrime).toBe(0)
    const omissions = trials.map((trial, index) => index < 13 ? ({ ...trial, payload: lexicaldecisionTrialSchema.parse({ ...trial.payload, response: null, rtMs: null }) }) : trial)
    expect(scoreLexicaldecisionV1({ config: lexicaldecisionConfig, trials: omissions, randomSeed: seed }).qualityFlags.excessiveOmissions).toBe(true)
    expect(() => scoreLexicaldecisionV1({ config: lexicaldecisionConfig, trials: trials.map((trial, index) => index === 0 ? { ...trial, payload: lexicaldecisionTrialSchema.parse({ ...trial.payload, lexicality: 'pseudo' }) } : trial), randomSeed: seed })).toThrow()
  })

  it('scores Emotion Recognition from frozen categories and detects category/constant anomalies', () => {
    const seed = 'emotion-golden'
    const sequence = emotionrecognitionSequence(seed, emotionConfig.totalTrials, 4)
    const trials = sequence.map((item, trialIndex) => ({ trialIndex, payload: emotionrecognitionTrialSchema.parse({ stimulusId: item.stimulusId, stimulusVersion: item.stimulusVersion, responseEmotion: item.emotion, rtMs: 300, interrupted: false }) }))
    const result = scoreEmotionrecognitionV1({ config: emotionConfig, trials, randomSeed: seed })
    expect(result.metrics).toMatchObject({ accuracy: 1, balancedAccuracy: 1, omissionRate: 0, validResponseCount: 24 })
    expect(result.qualityFlags.interpretable).toBe(true)
    const omissions = trials.map((trial, index) => index < 6 ? ({ ...trial, payload: emotionrecognitionTrialSchema.parse({ ...trial.payload, responseEmotion: null, rtMs: null }) }) : trial)
    const omissionResult = scoreEmotionrecognitionV1({ config: emotionConfig, trials: omissions, randomSeed: seed })
    expect(omissionResult.metrics).toMatchObject({ accuracy: 0.75, balancedAccuracy: 0.75, validResponseCount: 18 })
    const constant = trials.map((trial) => ({ ...trial, payload: emotionrecognitionTrialSchema.parse({ ...trial.payload, responseEmotion: 'happy' }) }))
    expect(scoreEmotionrecognitionV1({ config: emotionConfig, trials: constant, randomSeed: seed }).qualityFlags.constantResponse).toBe(true)
    const insufficient = trials.map((trial, index) => index < 8 ? ({ ...trial, payload: emotionrecognitionTrialSchema.parse({ ...trial.payload, responseEmotion: null, rtMs: null }) }) : trial)
    expect(scoreEmotionrecognitionV1({ config: emotionConfig, trials: insufficient, randomSeed: seed }).qualityFlags.insufficientPerCategory).toBe(true)
    expect(() => scoreEmotionrecognitionV1({ config: emotionConfig, trials: trials.map((trial, index) => index === 0 ? { ...trial, payload: emotionrecognitionTrialSchema.parse({ ...trial.payload, stimulusId: trials[1].payload.stimulusId }) } : trial), randomSeed: seed })).toThrow()
  })

  it('keeps new tasks descriptive, reference-free, standalone, and fully dictionary-backed', () => {
    for (const testType of ['wordlist', 'lexicaldecision', 'emotionrecognition']) {
      const entry = getCognitiveRegistryEntry(testType, '1.0.0', '1.0.0')
      expect(entry?.recommendedForCreate).toBe(false)
      expect(entry?.reportDefinition.showProductIndex).not.toBe(false)
      expect(listCognitiveTestsCatalog(testType).list[0].recommendedForCreate).toBe(false)
      const report = buildCognitiveSingleTaskReport({ testType, engineVersion: '1.0.0', scoringVersion: '1.0.0', configVersion: '1.0.0', profile: 'standard', frozenReport: null, score: 100, metrics: {}, qualityFlags: { interpretable: true }, reference: null })
      expect(report?.reference).toBeNull()
      expect(report?.productIndex?.value).toBe(100)
    }
    const protocolText = JSON.stringify(listAnalysisProtocolDefinitions())
    const packageText = JSON.stringify(listReportPackageDefinitions())
    for (const testType of ['wordlist', 'lexicaldecision', 'emotionrecognition']) {
      expect(protocolText).not.toContain(testType)
      expect(packageText).not.toContain(testType)
    }

    const result = scoreLexicaldecisionV1({
      config: lexicaldecisionConfig,
      randomSeed: 'dictionary',
      trials: lexicaldecisionSequence('dictionary', 40).map((item, trialIndex) => ({ trialIndex, payload: lexicaldecisionTrialSchema.parse({ stimulusId: item.stimulusId, stimulusVersion: item.stimulusVersion, lexicality: item.lexicality, wordLength: item.wordLength, frequencyBand: item.frequencyBand, pseudowordGeneratorVersion: item.pseudowordGeneratorVersion, response: item.lexicality === 'real' ? 'word' : 'nonword', rtMs: 300, interrupted: false }) })),
    })
    const pack = buildCognitiveResearchPackage({ id: 'lexical-assignment', title: 'Lexical DRAFT', profile: 'standard', resolvedReportSnapshotEncrypted: null, config: { testType: 'lexicaldecision' } } as never, [{ id: 'lexical-session', userId: null, anonymousCode: 'ANON-1', attemptNo: 1, testType: 'lexicaldecision', configVersion: '1.0.0', engineVersion: '1.0.0', scoringVersion: '1.0.0', startedAt: new Date('2026-01-01T00:00:00Z'), finishedAt: new Date('2026-01-01T00:01:00Z'), score: result.score, metrics: result.metrics, qualityFlags: result.qualityFlags, trials: [], user: null }] as never, true)
    const dictionaryKeys = pack.dictionaryRows.map((row) => row.key)
    for (const key of ['dPrime', 'lexicalityEffectMs', 'accuracyReal', 'accuracyPseudo', 'medianRtReal', 'medianRtPseudo', 'accuracyByFrequencyBand', 'omissionRate', 'validResponseCount', 'insufficientRealWords', 'insufficientPseudoWords', 'lowAccuracy', 'excessiveOmissions', 'constantResponse', 'interrupted']) expect(dictionaryKeys).toContain(key)
  })
})
