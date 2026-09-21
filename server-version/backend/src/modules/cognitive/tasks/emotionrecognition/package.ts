import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { emotionrecognitionConfigSchema } from '../../schemas/emotionrecognition.config'
import { emotionrecognitionTrialSchema } from '../../schemas/emotionrecognition.trial'
import { scoreEmotionrecognitionV1 } from '../../scoring/emotionrecognition.v1'
import {
  absoluteFallbackFinalSubmission,
  fixedCountFinalSubmission,
  nbackTaskCountFinalSubmission,
  phaseTaskCountFinalSubmission,
  spanTaskCountFinalSubmission,
  trailmakingTaskCountFinalSubmission,
} from '../../v2/final-submission-budget'
import { emotionrecognitionRegistryMeta } from './definitions'

const emotionrecognitionFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
{ testType: 'emotionrecognition', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: emotionrecognitionConfigSchema, trialSchema: emotionrecognitionTrialSchema, finalSubmission: emotionrecognitionFinalSubmission, score: scoreEmotionrecognitionV1, ...emotionrecognitionRegistryMeta }
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
