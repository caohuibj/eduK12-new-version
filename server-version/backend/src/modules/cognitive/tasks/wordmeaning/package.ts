import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { wordmeaningConfigSchema } from '../../schemas/wordmeaning.config'
import { wordmeaningTrialSchema } from '../../schemas/wordmeaning.trial'
import { scoreWordmeaningV1 } from '../../scoring/wordmeaning.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { wordmeaningRegistryMeta } from './definitions'

const wordmeaningFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'wordmeaning',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: wordmeaningConfigSchema,
    trialSchema: wordmeaningTrialSchema,
    finalSubmission: wordmeaningFinalSubmission,
    score: scoreWordmeaningV1,
    ...wordmeaningRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
