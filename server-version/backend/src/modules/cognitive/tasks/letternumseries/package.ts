import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { letternumseriesConfigSchema } from '../../schemas/letternumseries.config'
import { letternumseriesTrialSchema } from '../../schemas/letternumseries.trial'
import { scoreLetternumseriesV1 } from '../../scoring/letternumseries.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { letternumseriesRegistryMeta } from './definitions'

const letternumseriesFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'letternumseries',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: letternumseriesConfigSchema,
    trialSchema: letternumseriesTrialSchema,
    finalSubmission: letternumseriesFinalSubmission,
    score: scoreLetternumseriesV1,
    ...letternumseriesRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
