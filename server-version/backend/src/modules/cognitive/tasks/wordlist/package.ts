import type { RegistryEntry } from '../../cognitive.types'
import { wordlistConfigSchema } from '../../schemas/wordlist.config'
import { wordlistTrialSchema } from '../../schemas/wordlist.trial'
import { scoreWordlistV1 } from '../../scoring/wordlist.v1'
import {
  absoluteFallbackFinalSubmission,
  fixedCountFinalSubmission,
  nbackTaskCountFinalSubmission,
  phaseTaskCountFinalSubmission,
  spanTaskCountFinalSubmission,
  trailmakingTaskCountFinalSubmission,
} from '../../v2/final-submission-budget'
import { wordlistRegistryMeta } from './definitions'

const wordlistFinalSubmission = phaseTaskCountFinalSubmission()

export const executionEntries = [
{ testType: 'wordlist', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: wordlistConfigSchema, trialSchema: wordlistTrialSchema, finalSubmission: wordlistFinalSubmission, score: scoreWordlistV1, ...wordlistRegistryMeta }
] as unknown as RegistryEntry<unknown, unknown>[]
