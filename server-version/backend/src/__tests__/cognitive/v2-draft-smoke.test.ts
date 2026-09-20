import { describe, expect, it } from 'vitest'
import { COGNITIVE_SEEDS } from '../../../prisma/seeds/cognitive'
import {
  assertTaskContractValid,
  createSessionConfigSnapshot,
  createTrialEnvelope,
  listCognitiveV2TaskDefinitions,
  parseTrialEnvelope,
  type TaskDefinition,
} from '../../modules/cognitive/v2'

const sceneIds = Array.from({ length: 6 }, (_, index) => `scene-${String(index + 1).padStart(2, '0')}`)
const pairResponses = Array.from({ length: 6 }, (_, index) => ({ itemId: `pair-${String(index + 1).padStart(2, '0')}`, selectedPosition: index % 4 }))

const payloadFor = (testType: string): { phase: 'test' | 'learning'; payload: unknown } => {
  switch (testType) {
    case 'fake': return { phase: 'test', payload: { correct: true, rtMs: 400 } }
    case 'reaction': return { phase: 'test', payload: { foreperiodMs: 700, rtMs: 350, prematureCount: 0, interrupted: false, inputMode: 'pointer' } }
    case 'memory': return { phase: 'test', payload: { length: 2, trialWithinLevel: 1, sequence: [1, 2], response: [1, 2], responseDurationMs: 100, interrupted: false } }
    case 'stroop': return { phase: 'test', payload: { word: '红', inkColor: 'red', response: 'red', rtMs: 300, interrupted: false } }
    case 'gonogo': return { phase: 'test', payload: { trialType: 'go', responded: true, rtMs: 300, interrupted: false } }
    case 'cpt': return { phase: 'test', payload: { blockIndex: 0, stimulus: 'X', isTarget: true, responded: true, rtMs: 300, interrupted: false } }
    case 'nback': return { phase: 'test', payload: { blockIndex: 0, nLevel: 1, stimulus: 'A', target: true, responded: true, rtMs: 300, interrupted: false } }
    case 'corsi': return { phase: 'test', payload: { spanLength: 3, trialWithinLevel: 1, sequence: [0, 1, 2], response: [0, 1, 2], responseDurationMs: 500, interrupted: false } }
    case 'sst': return { phase: 'test', payload: { trialType: 'go', goStimulus: 'left', response: 'left', rtMs: 300, ssdMs: null, stopSignalPresented: false, interrupted: false } }
    case 'taskswitch': return { phase: 'test', payload: { blockIndex: 0, taskRule: 'parity', previousTaskRule: null, switchType: 'start', stimulus: 2, response: 'left', rtMs: 300, interrupted: false } }
    case 'patterncompare': return { phase: 'test', payload: { leftPattern: { shape: 'circle', fill: 'solid', marks: 1, rotation: 0 }, rightPattern: { shape: 'circle', fill: 'solid', marks: 1, rotation: 0 }, response: 'same', rtMs: 300, interrupted: false, timedOut: false } }
    case 'flanker': return { phase: 'test', payload: { targetDirection: 'left', flankerDirection: 'right', response: 'left', rtMs: 300, interrupted: false, timedOut: false } }
    case 'cardsort': return { phase: 'test', payload: { ruleCue: 'color', stimulusColor: 'red', stimulusShape: 'circle', response: 'left', rtMs: 300, interrupted: false, timedOut: false } }
    case 'digitbackward': return { phase: 'test', payload: { spanLength: 2, trialWithinLevel: 1, sequence: [1, 2], response: [2, 1], responseDurationMs: 100, interrupted: false, timedOut: false } }
    case 'picturesequence': return { phase: 'learning', payload: { phase: 'learning', roundIndex: 0, itemIds: sceneIds, responseOrder: sceneIds, responseDurationMs: 100, interrupted: false, timedOut: false } }
    case 'pairedassociate': return { phase: 'learning', payload: { phase: 'learning', roundIndex: 0, responses: pairResponses, responseDurationMs: 100, interrupted: false, timedOut: false } }
    case 'matrix': return { phase: 'test', payload: { itemId: 'matrix-01', selectedOption: 0, rtMs: 300, interrupted: false, timedOut: false } }
    case 'mentalrotation': return { phase: 'test', payload: { itemId: 'rotation-001', response: 'same', rtMs: 300, interrupted: false, timedOut: false } }
    case 'tower': return { phase: 'test', payload: { problemId: 'tower-01', moves: [], gaveUp: false, interrupted: false, timedOut: false } }
    case 'trailmaking': return { phase: 'test', payload: { attempts: [], deviceClass: 'desktop', interrupted: false } }
    case 'reversallearning': return { phase: 'test', payload: { choice: 'left', rtMs: 300, interrupted: false } }
    case 'bart': return { phase: 'test', payload: { pumpCount: 1, completed: true, cashedOut: true, interrupted: false } }
    case 'wordlist': return { phase: 'learning', payload: { listId: 'wordlist-01', stimulusSetVersion: 'chinese-wordlist-v1.0.0', phase: 'learning', responses: ['学校'], responseDurationMs: 100, interrupted: false } }
    case 'lexicaldecision': return { phase: 'test', payload: { stimulusId: 'zh-real-2-ab-001', stimulusVersion: 'zh-lexical-v1.0.0', lexicality: 'real', wordLength: 2, frequencyBand: 'high', pseudowordGeneratorVersion: 'zh-pseudoword-generator-v1.0.0', response: 'word', rtMs: 300, interrupted: false } }
    case 'emotionrecognition': return { phase: 'test', payload: { stimulusId: 'emotion-identity-01-happy', stimulusVersion: 'emotion-faces-ai-zh-v1.0.0', responseEmotion: 'happy', rtMs: 300, interrupted: false } }
    default: throw new Error(`No cognitive smoke payload for ${testType}`)
  }
}

const seedFor = (definition: TaskDefinition): typeof COGNITIVE_SEEDS[number] | undefined => (
  COGNITIVE_SEEDS.find((seed) => seed.testType === definition.testType
    && seed.engineVersion === definition.engineVersion
    && seed.scoringVersion === definition.scoringVersion)
)

describe('Cognitive v2 exact-identity contract smoke fixtures', () => {
  const definitions = listCognitiveV2TaskDefinitions()

  it('covers every registered exact identity with a seeded config and valid envelope payload', () => {
    expect(definitions).toHaveLength(28)
    for (const definition of definitions) {
      const seed = seedFor(definition)
      expect(seed, `${definition.testType}/${definition.scoringVersion} is missing a seed fixture`).toBeTruthy()
      if (!seed) continue
      const snapshot = createSessionConfigSnapshot({
        definition,
        configVersion: seed.configVersion,
        config: seed.config,
      })
      expect(snapshot.protocolSignature).toMatch(/^[0-9a-f]{64}$/)
      const fixture = payloadFor(definition.testType)
      const payload = definition.trialSchema.parse(fixture.payload)
      const envelope = createTrialEnvelope({
        trialIndex: 0,
        phase: fixture.phase,
        payload,
        startedAtPerfMs: 0,
        endedAtPerfMs: 25,
      })
      expect(parseTrialEnvelope(envelope).payload).toEqual(payload)
      expect(() => assertTaskContractValid(definition)).not.toThrow()
    }
  })
})
