import { nbackConfigSchema } from '../../schemas/nback.config'
import { nbackTrialSchema } from '../../schemas/nback.trial'
import { scoreNbackV1 } from '../../scoring/nback.v1'
import { nbackTaskCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { nbackRegistryMeta } from './definitions'

const nbackFinalSubmission = nbackTaskCountFinalSubmission()

export const nbackTaskPackage = defineCognitiveTaskPackage({
  testType: 'nback',
  entries: [
  {
  testType: 'nback',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: nbackConfigSchema,
  trialSchema: nbackTrialSchema,
  finalSubmission: nbackFinalSubmission,
  score: scoreNbackV1,
  ...nbackRegistryMeta,
}
  ],
})
