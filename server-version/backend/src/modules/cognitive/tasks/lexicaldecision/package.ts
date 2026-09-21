import { lexicaldecisionConfigSchema } from '../../schemas/lexicaldecision.config'
import { lexicaldecisionTrialSchema } from '../../schemas/lexicaldecision.trial'
import { scoreLexicaldecisionV1 } from '../../scoring/lexicaldecision.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { lexicaldecisionRegistryMeta } from './definitions'

const lexicaldecisionFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const lexicaldecisionTaskPackage = defineCognitiveTaskPackage({
  testType: 'lexicaldecision',
  entries: [
  { testType: 'lexicaldecision', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: lexicaldecisionConfigSchema, trialSchema: lexicaldecisionTrialSchema, finalSubmission: lexicaldecisionFinalSubmission, score: scoreLexicaldecisionV1, ...lexicaldecisionRegistryMeta }
  ],
})
