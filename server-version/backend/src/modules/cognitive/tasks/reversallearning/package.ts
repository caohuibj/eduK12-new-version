import { reversallearningConfigSchema } from '../../schemas/reversallearning.config'
import { reversallearningTrialSchema } from '../../schemas/reversallearning.trial'
import { scoreReversallearningV1 } from '../../scoring/reversallearning.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { reversallearningRegistryMeta } from './definitions'

const reversallearningFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const reversallearningTaskPackage = defineCognitiveTaskPackage({
  testType: 'reversallearning',
  protocolPhases: [
    { key: 'test', persists: true, required: true },
  ],
  qualityEffects: {
    constantChoice: 'limited',
    excessiveOmissions: 'limited',
    insufficientAcquisitionTrials: 'limited',
    insufficientReversalTrials: 'limited',
    interpretable: 'none',
    interrupted: 'limited',
    lowAccuracy: 'limited',
    noAcquisitionCriterion: 'limited',
    noReversalCriterion: 'limited',
  },
  entries: [
  { testType: 'reversallearning', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: reversallearningConfigSchema, trialSchema: reversallearningTrialSchema, finalSubmission: reversallearningFinalSubmission, score: scoreReversallearningV1, ...reversallearningRegistryMeta }
  ],
})
