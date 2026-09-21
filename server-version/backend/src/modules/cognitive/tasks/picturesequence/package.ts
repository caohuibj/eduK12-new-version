import { picturesequenceConfigSchema } from '../../schemas/picturesequence.config'
import { picturesequenceTrialSchema } from '../../schemas/picturesequence.trial'
import { scorePicturesequenceV1 } from '../../scoring/picturesequence.v1'
import { phaseTaskCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { picturesequenceRegistryMeta } from './definitions'

const picturesequenceFinalSubmission = phaseTaskCountFinalSubmission()

export const picturesequenceTaskPackage = defineCognitiveTaskPackage({
  testType: 'picturesequence',
  protocolPhases: [
    { key: 'learning', persists: true, required: true },
    { key: 'delayed', persists: true, required: false },
  ],
  qualityEffects: {
    delayedStageIncomplete: 'limited',
    emptyResponse: 'limited',
    incompleteResponse: 'limited',
    interpretable: 'none',
    interrupted: 'limited',
    unchangedIncorrectOrder: 'limited',
  },
  entries: [
  {
  testType: 'picturesequence',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: picturesequenceConfigSchema,
  trialSchema: picturesequenceTrialSchema,
  finalSubmission: picturesequenceFinalSubmission,
  score: scorePicturesequenceV1,
  ...picturesequenceRegistryMeta,
}
  ],
})
