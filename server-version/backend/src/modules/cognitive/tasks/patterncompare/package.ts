import { patterncompareConfigSchema } from '../../schemas/patterncompare.config'
import { patterncompareTrialSchema } from '../../schemas/patterncompare.trial'
import { scorePatterncompareV1 } from '../../scoring/patterncompare.v1'
import { absoluteFallbackFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { patterncompareRegistryMeta } from './definitions'

const patterncompareFinalSubmission = absoluteFallbackFinalSubmission()

export const patterncompareTaskPackage = defineCognitiveTaskPackage({
  testType: 'patterncompare',
  entries: [
  {
  testType: 'patterncompare',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: patterncompareConfigSchema,
  trialSchema: patterncompareTrialSchema,
  finalSubmission: patterncompareFinalSubmission,
  score: scorePatterncompareV1,
  ...patterncompareRegistryMeta,
}
  ],
})
