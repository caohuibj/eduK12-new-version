import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { corsiConfigSchema } from '../../schemas/corsi.config'
import { corsiTrialSchema } from '../../schemas/corsi.trial'
import { scoreCorsiV1 } from '../../scoring/corsi.v1'
import {
  absoluteFallbackFinalSubmission,
  fixedCountFinalSubmission,
  nbackTaskCountFinalSubmission,
  phaseTaskCountFinalSubmission,
  spanTaskCountFinalSubmission,
  trailmakingTaskCountFinalSubmission,
} from '../../v2/final-submission-budget'
import { corsiRegistryMeta } from './definitions'

const corsiFinalSubmission = spanTaskCountFinalSubmission('startSpan', 'maxSpan', 'trialsPerLevel')

export const executionEntries = [
{
  testType: 'corsi',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: corsiConfigSchema,
  trialSchema: corsiTrialSchema,
  finalSubmission: corsiFinalSubmission,
  score: scoreCorsiV1,
  ...corsiRegistryMeta,
}
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
