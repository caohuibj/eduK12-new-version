import { cardsortConfigSchema } from '../../schemas/cardsort.config'
import { cardsortTrialSchema } from '../../schemas/cardsort.trial'
import { scoreCardsortV1 } from '../../scoring/cardsort.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { cardsortRegistryMeta } from './definitions'

const cardsortFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const cardsortTaskPackage = defineCognitiveTaskPackage({
  testType: 'cardsort',
  protocolPhases: [
    { key: 'test', persists: true, required: true },
  ],
  qualityEffects: {
    constantResponse: 'limited',
    excessiveOmissions: 'limited',
    insufficientRepeatTrials: 'limited',
    insufficientSwitchTrials: 'limited',
    interpretable: 'none',
    interrupted: 'limited',
    lowAccuracy: 'limited',
  },
  entries: [
  {
  testType: 'cardsort',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: cardsortConfigSchema,
  trialSchema: cardsortTrialSchema,
  finalSubmission: cardsortFinalSubmission,
  score: scoreCardsortV1,
  ...cardsortRegistryMeta,
}
  ],
})
