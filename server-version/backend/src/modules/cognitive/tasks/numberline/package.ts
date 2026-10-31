import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { numberlineConfigSchema } from '../../schemas/numberline.config'
import { numberlineTrialSchema } from '../../schemas/numberline.trial'
import { scoreNumberlineV1 } from '../../scoring/numberline.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { numberlineRegistryMeta } from './definitions'

const numberlineFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'numberline',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    configSchema: numberlineConfigSchema,
    trialSchema: numberlineTrialSchema,
    finalSubmission: numberlineFinalSubmission,
    score: scoreNumberlineV1,
    ...numberlineRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
