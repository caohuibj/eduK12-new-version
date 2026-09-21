import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { gonogoConfigSchema } from '../../schemas/gonogo.config'
import { gonogoTrialSchema } from '../../schemas/gonogo.trial'
import { scoreGonogoV1 } from '../../scoring/gonogo.v1'
import {
  absoluteFallbackFinalSubmission,
  fixedCountFinalSubmission,
  nbackTaskCountFinalSubmission,
  phaseTaskCountFinalSubmission,
  spanTaskCountFinalSubmission,
  trailmakingTaskCountFinalSubmission,
} from '../../v2/final-submission-budget'
import { gonogoRegistryMeta } from './definitions'

const gonogoFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
{
  testType: 'gonogo',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: gonogoConfigSchema,
  trialSchema: gonogoTrialSchema,
  finalSubmission: gonogoFinalSubmission,
  score: scoreGonogoV1,
  ...gonogoRegistryMeta,
}
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
