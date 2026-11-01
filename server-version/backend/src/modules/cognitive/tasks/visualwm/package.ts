import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { visualwmConfigSchema } from '../../schemas/visualwm.config'
import { visualwmTrialSchema } from '../../schemas/visualwm.trial'
import { scoreVisualwmV1 } from '../../scoring/visualwm.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { visualwmRegistryMeta } from './definitions'

const visualwmFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'visualwm',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    configSchema: visualwmConfigSchema,
    trialSchema: visualwmTrialSchema,
    finalSubmission: visualwmFinalSubmission,
    score: scoreVisualwmV1,
    ...visualwmRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
