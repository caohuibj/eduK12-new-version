import { wordlistConfigSchema } from '../../schemas/wordlist.config'
import { wordlistTrialSchema } from '../../schemas/wordlist.trial'
import { scoreWordlistV1 } from '../../scoring/wordlist.v1'
import { phaseTaskCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { wordlistRegistryMeta } from './definitions'

const wordlistFinalSubmission = phaseTaskCountFinalSubmission()

export const wordlistTaskPackage = defineCognitiveTaskPackage({
  testType: 'wordlist',
  entries: [
  { testType: 'wordlist', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: wordlistConfigSchema, trialSchema: wordlistTrialSchema, finalSubmission: wordlistFinalSubmission, score: scoreWordlistV1, ...wordlistRegistryMeta }
  ],
})
