import { emotionrecognitionConfigSchema } from '../../schemas/emotionrecognition.config'
import { emotionrecognitionTrialSchema } from '../../schemas/emotionrecognition.trial'
import { scoreEmotionrecognitionV1 } from '../../scoring/emotionrecognition.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { emotionrecognitionRegistryMeta } from './definitions'

const emotionrecognitionFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const emotionrecognitionTaskPackage = defineCognitiveTaskPackage({
  testType: 'emotionrecognition',
  entries: [
  { testType: 'emotionrecognition', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: emotionrecognitionConfigSchema, trialSchema: emotionrecognitionTrialSchema, finalSubmission: emotionrecognitionFinalSubmission, score: scoreEmotionrecognitionV1, ...emotionrecognitionRegistryMeta }
  ],
})
