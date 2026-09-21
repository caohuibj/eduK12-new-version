import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { cptConfigSchema } from '../../schemas/cpt.config'
import { cptTrialSchema } from '../../schemas/cpt.trial'
import { scoreCptV1 } from '../../scoring/cpt.v1'
import {
  absoluteFallbackFinalSubmission,
  fixedCountFinalSubmission,
  nbackTaskCountFinalSubmission,
  phaseTaskCountFinalSubmission,
  spanTaskCountFinalSubmission,
  trailmakingTaskCountFinalSubmission,
} from '../../v2/final-submission-budget'
import { cptRegistryMeta } from './definitions'

const cptFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
{
  testType: 'cpt',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: cptConfigSchema,
  trialSchema: cptTrialSchema,
  finalSubmission: cptFinalSubmission,
  score: scoreCptV1,
  ...cptRegistryMeta,
}
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
