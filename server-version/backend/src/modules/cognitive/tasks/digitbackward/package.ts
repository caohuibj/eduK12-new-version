import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { digitbackwardConfigSchema } from '../../schemas/digitbackward.config'
import { digitbackwardTrialSchema } from '../../schemas/digitbackward.trial'
import { scoreDigitbackwardV1 } from '../../scoring/digitbackward.v1'
import {
  absoluteFallbackFinalSubmission,
  fixedCountFinalSubmission,
  nbackTaskCountFinalSubmission,
  phaseTaskCountFinalSubmission,
  spanTaskCountFinalSubmission,
  trailmakingTaskCountFinalSubmission,
} from '../../v2/final-submission-budget'
import { digitbackwardRegistryMeta } from './definitions'

const digitbackwardFinalSubmission = spanTaskCountFinalSubmission('startSpan', 'maxSpan', 'trialsPerLevel')

export const executionEntries = [
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
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
