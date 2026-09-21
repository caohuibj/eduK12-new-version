import { digitbackwardConfigSchema } from '../../schemas/digitbackward.config'
import { digitbackwardTrialSchema } from '../../schemas/digitbackward.trial'
import { scoreDigitbackwardV1 } from '../../scoring/digitbackward.v1'
import { spanTaskCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { digitbackwardRegistryMeta } from './definitions'

const digitbackwardFinalSubmission = spanTaskCountFinalSubmission('startSpan', 'maxSpan', 'trialsPerLevel')

export const digitbackwardTaskPackage = defineCognitiveTaskPackage({
  testType: 'digitbackward',
  entries: [
  {
  testType: 'digitbackward',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: digitbackwardConfigSchema,
  trialSchema: digitbackwardTrialSchema,
  finalSubmission: digitbackwardFinalSubmission,
  score: scoreDigitbackwardV1,
  ...digitbackwardRegistryMeta,
}
  ],
})
