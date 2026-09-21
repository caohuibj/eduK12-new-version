import type { RegistryEntry } from '../../cognitive.types'
import { taskswitchConfigSchema } from '../../schemas/taskswitch.config'
import { taskswitchTrialSchema } from '../../schemas/taskswitch.trial'
import { scoreTaskswitchV1 } from '../../scoring/taskswitch.v1'
import {
  absoluteFallbackFinalSubmission,
  fixedCountFinalSubmission,
  nbackTaskCountFinalSubmission,
  phaseTaskCountFinalSubmission,
  spanTaskCountFinalSubmission,
  trailmakingTaskCountFinalSubmission,
} from '../../v2/final-submission-budget'
import { taskswitchRegistryMeta } from './definitions'

const taskswitchFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
{
  testType: 'taskswitch',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: taskswitchConfigSchema,
  trialSchema: taskswitchTrialSchema,
  finalSubmission: taskswitchFinalSubmission,
  score: scoreTaskswitchV1,
  ...taskswitchRegistryMeta,
}
] as unknown as RegistryEntry<unknown, unknown>[]
