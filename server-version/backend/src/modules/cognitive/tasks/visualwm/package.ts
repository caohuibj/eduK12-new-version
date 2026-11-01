import { executionSemantics } from './semantics'
import { executionSemanticsV11 } from './semantics.v11'
import type { RegistryEntry } from '../../cognitive.types'
import { visualwmConfigSchema } from '../../schemas/visualwm.config'
import { visualwmTrialSchema } from '../../schemas/visualwm.trial'
import { scoreVisualwmV1 } from '../../scoring/visualwm.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { visualwmRegistryMeta } from './definitions'
import { visualwmRegistryMetaV11 } from './definitions.v11'

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
    recommendedForCreate: false,
  },
  {
    testType: 'visualwm',
    engineVersion: '1.1.0',
    scoringVersion: '1.0.0',
    configSchema: visualwmConfigSchema,
    trialSchema: visualwmTrialSchema,
    finalSubmission: visualwmFinalSubmission,
    score: scoreVisualwmV1,
    ...visualwmRegistryMetaV11,
  },
].map((entry, index) => ({ ...entry, executionSemantics: [...executionSemantics, ...executionSemanticsV11][index] })) as unknown as RegistryEntry<unknown, unknown>[]
