import { cptConfigSchema } from '../../schemas/cpt.config'
import { cptTrialSchema } from '../../schemas/cpt.trial'
import { scoreCptV1 } from '../../scoring/cpt.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { cptRegistryMeta } from './definitions'

const cptFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const cptTaskPackage = defineCognitiveTaskPackage({
  testType: 'cpt',
  entries: [
  {
  testType: 'cpt',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: cptConfigSchema,
  trialSchema: cptTrialSchema,
  finalSubmission: cptFinalSubmission,
  score: scoreCptV1,
  ...cptRegistryMeta,
}
  ],
})
