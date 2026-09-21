import { taskswitchConfigSchema } from '../../schemas/taskswitch.config'
import { taskswitchTrialSchema } from '../../schemas/taskswitch.trial'
import { scoreTaskswitchV1 } from '../../scoring/taskswitch.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { taskswitchRegistryMeta } from './definitions'

const taskswitchFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const taskswitchTaskPackage = defineCognitiveTaskPackage({
  testType: 'taskswitch',
  entries: [
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
  ],
})
