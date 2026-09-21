import { bartConfigSchema } from '../../schemas/bart.config'
import { bartTrialSchema } from '../../schemas/bart.trial'
import { scoreBartV1 } from '../../scoring/bart.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { bartRegistryMeta } from './definitions'

const bartFinalSubmission = fixedCountFinalSubmission('balloonCount')

export const bartTaskPackage = defineCognitiveTaskPackage({
  testType: 'bart',
  protocolPhases: [
    { key: 'test', persists: true, required: true },
  ],
  qualityEffects: {
    constantPumpPattern: 'limited',
    excessiveOmissions: 'limited',
    insufficientCashoutBalloons: 'limited',
    insufficientCompletedBalloons: 'limited',
    interpretable: 'none',
    interrupted: 'limited',
    invalidOutcome: 'invalid',
  },
  entries: [
  { testType: 'bart', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: bartConfigSchema, trialSchema: bartTrialSchema, finalSubmission: bartFinalSubmission, score: scoreBartV1, ...bartRegistryMeta }
  ],
})
