import { CognitiveProfile, RegistryEntry } from './cognitive.types'
import {
  fakeRegistryMeta,
  memoryRegistryMeta,
  memoryRegistryMetaV11,
  reactionRegistryMeta,
  reactionRegistryMetaV11,
  stroopRegistryMeta,
  stroopRegistryMetaV11,
  gonogoRegistryMeta,
  cptRegistryMeta,
  nbackRegistryMeta,
  corsiRegistryMeta,
  sstRegistryMeta,
  taskswitchRegistryMeta,
  patterncompareRegistryMeta,
  flankerRegistryMeta,
  cardsortRegistryMeta,
  digitbackwardRegistryMeta,
  picturesequenceRegistryMeta,
  pairedassociateRegistryMeta,
  matrixRegistryMeta,
  mentalrotationRegistryMeta,
  towerRegistryMeta,
  trailmakingRegistryMeta,
  reversallearningRegistryMeta,
  bartRegistryMeta,
  wordlistRegistryMeta,
  lexicaldecisionRegistryMeta,
  emotionrecognitionRegistryMeta,
} from './registry-definitions'
import { fakeConfigSchema } from './schemas/fake.config'
import { fakeTrialSchema } from './schemas/fake.trial'
import { scoreFakeV1 } from './scoring/fake.v1'
import { reactionConfigSchema } from './schemas/reaction.config'
import { reactionTrialSchema } from './schemas/reaction.trial'
import { scoreReactionV1 } from './scoring/reaction.v1'
import { scoreReactionV1_1 } from './scoring/reaction.v1_1'
import { memoryConfigSchema } from './schemas/memory.config'
import { memoryTrialSchema } from './schemas/memory.trial'
import { scoreMemoryV1 } from './scoring/memory.v1'
import { scoreMemoryV1_1 } from './scoring/memory.v1_1'
import { stroopConfigSchema } from './schemas/stroop.config'
import { stroopTrialSchema } from './schemas/stroop.trial'
import { scoreStroopV1 } from './scoring/stroop.v1'
import { scoreStroopV1_1 } from './scoring/stroop.v1_1'
import { gonogoConfigSchema } from './schemas/gonogo.config'
import { gonogoTrialSchema } from './schemas/gonogo.trial'
import { scoreGonogoV1 } from './scoring/gonogo.v1'
import { cptConfigSchema } from './schemas/cpt.config'
import { cptTrialSchema } from './schemas/cpt.trial'
import { scoreCptV1 } from './scoring/cpt.v1'
import { nbackConfigSchema } from './schemas/nback.config'
import { nbackTrialSchema } from './schemas/nback.trial'
import { scoreNbackV1 } from './scoring/nback.v1'
import { corsiConfigSchema } from './schemas/corsi.config'
import { corsiTrialSchema } from './schemas/corsi.trial'
import { scoreCorsiV1 } from './scoring/corsi.v1'
import { sstConfigSchema } from './schemas/sst.config'
import { sstTrialSchema } from './schemas/sst.trial'
import { scoreSstV1 } from './scoring/sst.v1'
import { taskswitchConfigSchema } from './schemas/taskswitch.config'
import { taskswitchTrialSchema } from './schemas/taskswitch.trial'
import { scoreTaskswitchV1 } from './scoring/taskswitch.v1'
import { patterncompareConfigSchema } from './schemas/patterncompare.config'
import { patterncompareTrialSchema } from './schemas/patterncompare.trial'
import { scorePatterncompareV1 } from './scoring/patterncompare.v1'
import { flankerConfigSchema } from './schemas/flanker.config'
import { flankerTrialSchema } from './schemas/flanker.trial'
import { scoreFlankerV1 } from './scoring/flanker.v1'
import { cardsortConfigSchema } from './schemas/cardsort.config'
import { cardsortTrialSchema } from './schemas/cardsort.trial'
import { scoreCardsortV1 } from './scoring/cardsort.v1'
import { digitbackwardConfigSchema } from './schemas/digitbackward.config'
import { digitbackwardTrialSchema } from './schemas/digitbackward.trial'
import { scoreDigitbackwardV1 } from './scoring/digitbackward.v1'
import { picturesequenceConfigSchema } from './schemas/picturesequence.config'
import { picturesequenceTrialSchema } from './schemas/picturesequence.trial'
import { scorePicturesequenceV1 } from './scoring/picturesequence.v1'
import { pairedassociateConfigSchema } from './schemas/pairedassociate.config'
import { pairedassociateTrialSchema } from './schemas/pairedassociate.trial'
import { scorePairedassociateV1 } from './scoring/pairedassociate.v1'
import { matrixConfigSchema } from './schemas/matrix.config'
import { matrixTrialSchema } from './schemas/matrix.trial'
import { scoreMatrixV1 } from './scoring/matrix.v1'
import { mentalrotationConfigSchema } from './schemas/mentalrotation.config'
import { mentalrotationTrialSchema } from './schemas/mentalrotation.trial'
import { scoreMentalrotationV1 } from './scoring/mentalrotation.v1'
import { towerConfigSchema } from './schemas/tower.config'
import { towerTrialSchema } from './schemas/tower.trial'
import { scoreTowerV1 } from './scoring/tower.v1'
import { trailmakingConfigSchema } from './schemas/trailmaking.config'
import { trailmakingTrialSchema } from './schemas/trailmaking.trial'
import { scoreTrailmakingV1 } from './scoring/trailmaking.v1'
import { reversallearningConfigSchema } from './schemas/reversallearning.config'
import { reversallearningTrialSchema } from './schemas/reversallearning.trial'
import { scoreReversallearningV1 } from './scoring/reversallearning.v1'
import { bartConfigSchema } from './schemas/bart.config'
import { bartTrialSchema } from './schemas/bart.trial'
import { scoreBartV1 } from './scoring/bart.v1'
import { wordlistConfigSchema } from './schemas/wordlist.config'
import { wordlistTrialSchema } from './schemas/wordlist.trial'
import { scoreWordlistV1 } from './scoring/wordlist.v1'
import { lexicaldecisionConfigSchema } from './schemas/lexicaldecision.config'
import { lexicaldecisionTrialSchema } from './schemas/lexicaldecision.trial'
import { scoreLexicaldecisionV1 } from './scoring/lexicaldecision.v1'
import { emotionrecognitionConfigSchema } from './schemas/emotionrecognition.config'
import { emotionrecognitionTrialSchema } from './schemas/emotionrecognition.trial'
import { scoreEmotionrecognitionV1 } from './scoring/emotionrecognition.v1'
import {
  absoluteFallbackFinalSubmission,
  fixedCountFinalSubmission,
  nbackTaskCountFinalSubmission,
  phaseTaskCountFinalSubmission,
  spanTaskCountFinalSubmission,
  trailmakingTaskCountFinalSubmission,
} from './v2/final-submission-budget'

/**
 * Cognitive Registry（D2 Step 5）。
 *
 * 静态 registry：构建时注册，重复 key 立即抛错。
 * 定位键：testType + engineVersion + scoringVersion（错误版本绝不回退到"最新版"）。
 *
 * 明确不提供（D2 §9）：
 *  - runtime register API
 *  - plugin unload / hot reload
 *  - filesystem discovery / remote registry
 */

type AnyRegistryEntry = RegistryEntry<unknown, unknown>

const REGISTRY = new Map<string, AnyRegistryEntry>()

const keyOf = (testType: string, engineVersion: string, scoringVersion: string): string =>
  `${testType}/${engineVersion}/${scoringVersion}`

const registerEntry = <TConfig, TTrial>(entry: RegistryEntry<TConfig, TTrial>): void => {
  const k = keyOf(entry.testType, entry.engineVersion, entry.scoringVersion)
  if (REGISTRY.has(k)) {
    throw new Error(`Cognitive registry duplicate key: ${k}`)
  }
  REGISTRY.set(k, entry as AnyRegistryEntry)
}

export const hasCognitiveRegistryEntry = (
  testType: string,
  engineVersion: string,
  scoringVersion: string
): boolean => REGISTRY.has(keyOf(testType, engineVersion, scoringVersion))

export const getCognitiveRegistryEntry = (
  testType: string,
  engineVersion: string,
  scoringVersion: string
): AnyRegistryEntry | undefined => REGISTRY.get(keyOf(testType, engineVersion, scoringVersion))

/** 缺失直接抛错（供 D4/D6 在"服务端配置错误"场景使用）。 */
export const requireCognitiveRegistryEntry = (
  testType: string,
  engineVersion: string,
  scoringVersion: string
): AnyRegistryEntry => {
  const entry = REGISTRY.get(keyOf(testType, engineVersion, scoringVersion))
  if (!entry) {
    throw new Error(
      `No cognitive registry entry for ${testType}/${engineVersion}/${scoringVersion}`
    )
  }
  return entry
}

export const listCognitiveRegistryEntries = (): AnyRegistryEntry[] => [...REGISTRY.values()]

export const listCognitiveRegistryEntriesForType = (testType: string): AnyRegistryEntry[] =>
  listCognitiveRegistryEntries().filter((entry) => entry.testType === testType)

export const hasCognitiveProfile = (entry: AnyRegistryEntry, profile: string): profile is CognitiveProfile =>
  profile === 'experience' || profile === 'standard' || profile === 'research'
    ? Boolean(entry.profiles[profile])
    : false

// Each contract is attached to an exact RegistryEntry below. Shared instances
// are safe only when the versioned protocol contract is identical; the entry
// still owns the binding, so a future version can replace it independently.
const fakeFinalSubmission = fixedCountFinalSubmission('trialCount')
const reactionFinalSubmission = fixedCountFinalSubmission('totalTrials')
const memoryFinalSubmission = spanTaskCountFinalSubmission('startLength', 'maxLength', 'trialsPerLevel')
const stroopFinalSubmission = fixedCountFinalSubmission('totalTrials')
const gonogoFinalSubmission = fixedCountFinalSubmission('totalTrials')
const cptFinalSubmission = fixedCountFinalSubmission('totalTrials')
const nbackFinalSubmission = nbackTaskCountFinalSubmission()
const corsiFinalSubmission = spanTaskCountFinalSubmission('startSpan', 'maxSpan', 'trialsPerLevel')
const sstFinalSubmission = fixedCountFinalSubmission('totalTrials')
const taskswitchFinalSubmission = fixedCountFinalSubmission('totalTrials')
const patterncompareFinalSubmission = absoluteFallbackFinalSubmission()
const flankerFinalSubmission = fixedCountFinalSubmission('totalTrials')
const cardsortFinalSubmission = fixedCountFinalSubmission('totalTrials')
const digitbackwardFinalSubmission = spanTaskCountFinalSubmission('startSpan', 'maxSpan', 'trialsPerLevel')
const picturesequenceFinalSubmission = phaseTaskCountFinalSubmission()
const pairedassociateFinalSubmission = phaseTaskCountFinalSubmission()
const matrixFinalSubmission = fixedCountFinalSubmission('itemCount')
const mentalrotationFinalSubmission = fixedCountFinalSubmission('totalTrials')
const towerFinalSubmission = fixedCountFinalSubmission('problemCount')
const trailmakingFinalSubmission = trailmakingTaskCountFinalSubmission()
const reversallearningFinalSubmission = fixedCountFinalSubmission('totalTrials')
const bartFinalSubmission = fixedCountFinalSubmission('balloonCount')
const wordlistFinalSubmission = phaseTaskCountFinalSubmission()
const lexicaldecisionFinalSubmission = fixedCountFinalSubmission('totalTrials')
const emotionrecognitionFinalSubmission = fixedCountFinalSubmission('totalTrials')

// 注册 Fake Test：fake / 1.0.0 / 1.0.0
registerEntry({
  testType: 'fake',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: fakeConfigSchema,
  trialSchema: fakeTrialSchema,
  finalSubmission: fakeFinalSubmission,
  score: scoreFakeV1,
  ...fakeRegistryMeta,
})

// 注册 Reaction Test：reaction / 1.0.0 / 1.0.0（Milestone E Session 2）
registerEntry({
  testType: 'reaction',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: reactionConfigSchema,
  trialSchema: reactionTrialSchema,
  finalSubmission: reactionFinalSubmission,
  score: scoreReactionV1,
  ...reactionRegistryMeta,
})

// 注册 Memory Test：memory / 1.0.0 / 1.0.0（Milestone E Session 3）
registerEntry({
  testType: 'memory',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: memoryConfigSchema,
  trialSchema: memoryTrialSchema,
  finalSubmission: memoryFinalSubmission,
  score: scoreMemoryV1,
  ...memoryRegistryMeta,
})

// 注册 Stroop Test：stroop / 1.0.0 / 1.0.0（Milestone E Session 4）
registerEntry({
  testType: 'stroop',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: stroopConfigSchema,
  trialSchema: stroopTrialSchema,
  finalSubmission: stroopFinalSubmission,
  score: scoreStroopV1,
  ...stroopRegistryMeta,
})

registerEntry({
  testType: 'reaction',
  engineVersion: '1.0.0',
  scoringVersion: '1.1.0',
  configSchema: reactionConfigSchema,
  trialSchema: reactionTrialSchema,
  finalSubmission: reactionFinalSubmission,
  score: scoreReactionV1_1,
  ...reactionRegistryMetaV11,
})

registerEntry({
  testType: 'memory',
  engineVersion: '1.0.0',
  scoringVersion: '1.1.0',
  configSchema: memoryConfigSchema,
  trialSchema: memoryTrialSchema,
  finalSubmission: memoryFinalSubmission,
  score: scoreMemoryV1_1,
  ...memoryRegistryMetaV11,
})

registerEntry({
  testType: 'stroop',
  engineVersion: '1.0.0',
  scoringVersion: '1.1.0',
  configSchema: stroopConfigSchema,
  trialSchema: stroopTrialSchema,
  finalSubmission: stroopFinalSubmission,
  score: scoreStroopV1_1,
  ...stroopRegistryMetaV11,
})

registerEntry({
  testType: 'gonogo',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: gonogoConfigSchema,
  trialSchema: gonogoTrialSchema,
  finalSubmission: gonogoFinalSubmission,
  score: scoreGonogoV1,
  ...gonogoRegistryMeta,
})

registerEntry({
  testType: 'cpt',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: cptConfigSchema,
  trialSchema: cptTrialSchema,
  finalSubmission: cptFinalSubmission,
  score: scoreCptV1,
  ...cptRegistryMeta,
})

registerEntry({
  testType: 'nback',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: nbackConfigSchema,
  trialSchema: nbackTrialSchema,
  finalSubmission: nbackFinalSubmission,
  score: scoreNbackV1,
  ...nbackRegistryMeta,
})

registerEntry({
  testType: 'corsi',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: corsiConfigSchema,
  trialSchema: corsiTrialSchema,
  finalSubmission: corsiFinalSubmission,
  score: scoreCorsiV1,
  ...corsiRegistryMeta,
})

registerEntry({
  testType: 'sst',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: sstConfigSchema,
  trialSchema: sstTrialSchema,
  finalSubmission: sstFinalSubmission,
  score: scoreSstV1,
  ...sstRegistryMeta,
})

registerEntry({
  testType: 'taskswitch',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: taskswitchConfigSchema,
  trialSchema: taskswitchTrialSchema,
  finalSubmission: taskswitchFinalSubmission,
  score: scoreTaskswitchV1,
  ...taskswitchRegistryMeta,
})

registerEntry({
  testType: 'patterncompare',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: patterncompareConfigSchema,
  trialSchema: patterncompareTrialSchema,
  finalSubmission: patterncompareFinalSubmission,
  score: scorePatterncompareV1,
  ...patterncompareRegistryMeta,
})

registerEntry({
  testType: 'flanker',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: flankerConfigSchema,
  trialSchema: flankerTrialSchema,
  finalSubmission: flankerFinalSubmission,
  score: scoreFlankerV1,
  ...flankerRegistryMeta,
})

registerEntry({
  testType: 'cardsort',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: cardsortConfigSchema,
  trialSchema: cardsortTrialSchema,
  finalSubmission: cardsortFinalSubmission,
  score: scoreCardsortV1,
  ...cardsortRegistryMeta,
})

registerEntry({
  testType: 'digitbackward',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: digitbackwardConfigSchema,
  trialSchema: digitbackwardTrialSchema,
  finalSubmission: digitbackwardFinalSubmission,
  score: scoreDigitbackwardV1,
  ...digitbackwardRegistryMeta,
})

registerEntry({
  testType: 'picturesequence',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: picturesequenceConfigSchema,
  trialSchema: picturesequenceTrialSchema,
  finalSubmission: picturesequenceFinalSubmission,
  score: scorePicturesequenceV1,
  ...picturesequenceRegistryMeta,
})

registerEntry({
  testType: 'pairedassociate',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: pairedassociateConfigSchema,
  trialSchema: pairedassociateTrialSchema,
  finalSubmission: pairedassociateFinalSubmission,
  score: scorePairedassociateV1,
  ...pairedassociateRegistryMeta,
})

registerEntry({ testType: 'matrix', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: matrixConfigSchema, trialSchema: matrixTrialSchema, finalSubmission: matrixFinalSubmission, score: scoreMatrixV1, ...matrixRegistryMeta })
registerEntry({ testType: 'mentalrotation', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: mentalrotationConfigSchema, trialSchema: mentalrotationTrialSchema, finalSubmission: mentalrotationFinalSubmission, score: scoreMentalrotationV1, ...mentalrotationRegistryMeta })
registerEntry({ testType: 'tower', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: towerConfigSchema, trialSchema: towerTrialSchema, finalSubmission: towerFinalSubmission, score: scoreTowerV1, ...towerRegistryMeta })
registerEntry({ testType: 'trailmaking', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: trailmakingConfigSchema, trialSchema: trailmakingTrialSchema, finalSubmission: trailmakingFinalSubmission, score: scoreTrailmakingV1, ...trailmakingRegistryMeta })
registerEntry({ testType: 'reversallearning', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: reversallearningConfigSchema, trialSchema: reversallearningTrialSchema, finalSubmission: reversallearningFinalSubmission, score: scoreReversallearningV1, ...reversallearningRegistryMeta })
registerEntry({ testType: 'bart', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: bartConfigSchema, trialSchema: bartTrialSchema, finalSubmission: bartFinalSubmission, score: scoreBartV1, ...bartRegistryMeta })
registerEntry({ testType: 'wordlist', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: wordlistConfigSchema, trialSchema: wordlistTrialSchema, finalSubmission: wordlistFinalSubmission, score: scoreWordlistV1, ...wordlistRegistryMeta })
registerEntry({ testType: 'lexicaldecision', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: lexicaldecisionConfigSchema, trialSchema: lexicaldecisionTrialSchema, finalSubmission: lexicaldecisionFinalSubmission, score: scoreLexicaldecisionV1, ...lexicaldecisionRegistryMeta })
registerEntry({ testType: 'emotionrecognition', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: emotionrecognitionConfigSchema, trialSchema: emotionrecognitionTrialSchema, finalSubmission: emotionrecognitionFinalSubmission, score: scoreEmotionrecognitionV1, ...emotionrecognitionRegistryMeta })
