import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { nbackConfigSchema } from '../../schemas/nback.config'
import { nbackTrialSchema } from '../../schemas/nback.trial'
import { scoreNbackV1 } from '../../scoring/nback.v1'
import {
  absoluteFallbackFinalSubmission,
  fixedCountFinalSubmission,
  nbackTaskCountFinalSubmission,
  phaseTaskCountFinalSubmission,
  spanTaskCountFinalSubmission,
  trailmakingTaskCountFinalSubmission,
} from '../../v2/final-submission-budget'
import { nbackRegistryMeta } from './definitions'

const nbackFinalSubmission = nbackTaskCountFinalSubmission()

export const executionEntries = [
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
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
