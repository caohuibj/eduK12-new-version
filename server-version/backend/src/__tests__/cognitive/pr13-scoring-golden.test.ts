import { describe, expect, it } from 'vitest'
import wordlistGolden from '../../../cognitive-scoring-golden-wordlist-v1.json'
import lexicaldecisionGolden from '../../../cognitive-scoring-golden-lexicaldecision-v1.json'
import emotionrecognitionGolden from '../../../cognitive-scoring-golden-emotionrecognition-v1.json'
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

const contract = (result: { score: number; metrics: Record<string, unknown>; qualityFlags: Record<string, unknown> }) => ({ score: result.score, metrics: result.metrics, qualityFlags: result.qualityFlags })

describe('PR13 independent scoring golden fixtures', () => {
  it('freezes Wordlist score, metrics, and quality flags', () => {
    const config = wordlistConfigSchema.parse(wordlistGolden.config)
    const sequence = wordlistSequence(wordlistGolden.seed, config.listLength, config.learningRounds, config.delayedEnabled)
    const result = scoreWordlistV1({ config, randomSeed: wordlistGolden.seed, trials: sequence.map((stage, trialIndex) => ({ trialIndex, payload: wordlistTrialSchema.parse({ listId: stage.listId, stimulusSetVersion: stage.stimulusSetVersion, responses: stage.words, responseDurationMs: wordlistGolden.responseDurationMs, interrupted: false }) })) })
    expect(contract(result)).toEqual(wordlistGolden.expected)
  })

  it('freezes Lexical Decision score, metrics, and quality flags', () => {
    const config = lexicaldecisionConfigSchema.parse(lexicaldecisionGolden.config)
    const sequence = lexicaldecisionSequence(lexicaldecisionGolden.seed, config.totalTrials)
    const result = scoreLexicaldecisionV1({ config, randomSeed: lexicaldecisionGolden.seed, trials: sequence.map((item, trialIndex) => ({ trialIndex, payload: lexicaldecisionTrialSchema.parse({ stimulusId: item.stimulusId, stimulusVersion: item.stimulusVersion, lexicality: item.lexicality, wordLength: item.wordLength, frequencyBand: item.frequencyBand, pseudowordGeneratorVersion: item.pseudowordGeneratorVersion, response: item.lexicality === 'real' ? 'word' : 'nonword', rtMs: lexicaldecisionGolden.rtMs, interrupted: false }) })) })
    expect(contract(result)).toEqual(lexicaldecisionGolden.expected)
  })

  it('freezes Emotion Recognition score, metrics, and quality flags', () => {
    const config = emotionrecognitionConfigSchema.parse(emotionrecognitionGolden.config)
    const sequence = emotionrecognitionSequence(emotionrecognitionGolden.seed, config.totalTrials, 4)
    const result = scoreEmotionrecognitionV1({ config, randomSeed: emotionrecognitionGolden.seed, trials: sequence.map((item, trialIndex) => ({ trialIndex, payload: emotionrecognitionTrialSchema.parse({ stimulusId: item.stimulusId, stimulusVersion: item.stimulusVersion, responseEmotion: item.emotion, rtMs: emotionrecognitionGolden.rtMs, interrupted: false }) })) })
    expect(contract(result)).toEqual(emotionrecognitionGolden.expected)
  })
})
