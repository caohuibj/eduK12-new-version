import { stroopConfigSchema } from '../../schemas/stroop.config'
import { stroopTrialSchema } from '../../schemas/stroop.trial'
import { scoreStroopV1 } from '../../scoring/stroop.v1'
import { scoreStroopV1_1 } from '../../scoring/stroop.v1_1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { stroopRegistryMeta, stroopRegistryMetaV11 } from './definitions'

const stroopFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const stroopTaskPackage = defineCognitiveTaskPackage({
  testType: 'stroop',
  entries: [
  {
  testType: 'stroop',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: stroopConfigSchema,
  trialSchema: stroopTrialSchema,
  finalSubmission: stroopFinalSubmission,
  score: scoreStroopV1,
  ...stroopRegistryMeta,
},
  {
  testType: 'stroop',
  engineVersion: '1.0.0',
  scoringVersion: '1.1.0',
  configSchema: stroopConfigSchema,
  trialSchema: stroopTrialSchema,
  finalSubmission: stroopFinalSubmission,
  score: scoreStroopV1_1,
  ...stroopRegistryMetaV11,
}
  ],
})
