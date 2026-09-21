import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { sstConfigSchema } from '../../schemas/sst.config'
import { sstTrialSchema } from '../../schemas/sst.trial'
import { scoreSstV1 } from '../../scoring/sst.v1'
import {
  absoluteFallbackFinalSubmission,
  fixedCountFinalSubmission,
  nbackTaskCountFinalSubmission,
  phaseTaskCountFinalSubmission,
  spanTaskCountFinalSubmission,
  trailmakingTaskCountFinalSubmission,
} from '../../v2/final-submission-budget'
import { sstRegistryMeta } from './definitions'

const sstFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
{
  testType: 'sst',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: sstConfigSchema,
  trialSchema: sstTrialSchema,
  finalSubmission: sstFinalSubmission,
  score: scoreSstV1,
  ...sstRegistryMeta,
}
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
