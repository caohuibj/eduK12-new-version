import type { RegistryEntry } from '../../cognitive.types'
import { flankerConfigSchema } from '../../schemas/flanker.config'
import { flankerTrialSchema } from '../../schemas/flanker.trial'
import { scoreFlankerV1 } from '../../scoring/flanker.v1'
import {
  absoluteFallbackFinalSubmission,
  fixedCountFinalSubmission,
  nbackTaskCountFinalSubmission,
  phaseTaskCountFinalSubmission,
  spanTaskCountFinalSubmission,
  trailmakingTaskCountFinalSubmission,
} from '../../v2/final-submission-budget'
import { flankerRegistryMeta } from './definitions'

const flankerFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
{
  testType: 'flanker',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: flankerConfigSchema,
  trialSchema: flankerTrialSchema,
  finalSubmission: flankerFinalSubmission,
  score: scoreFlankerV1,
  ...flankerRegistryMeta,
}
] as unknown as RegistryEntry<unknown, unknown>[]
