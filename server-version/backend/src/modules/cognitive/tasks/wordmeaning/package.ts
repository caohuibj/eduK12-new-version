import { scoreWordmeaningV11 } from '../../scoring/wordmeaning.v1.1'
import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { wordmeaningConfigSchema, wordmeaningConfigSchemaV11 } from '../../schemas/wordmeaning.config'
import { wordmeaningTrialSchema } from '../../schemas/wordmeaning.trial'
import { scoreWordmeaningV1 } from '../../scoring/wordmeaning.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { wordmeaningRegistryMeta, wordmeaningRegistryMetaV11 } from './definitions'

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
    recommendedForCreate: false,
  },
  {
    testType: 'wordmeaning', engineVersion: '1.1.0', scoringVersion: '1.1.0',
    configSchema: wordmeaningConfigSchemaV11, trialSchema: wordmeaningTrialSchema,
    finalSubmission: wordmeaningFinalSubmission, score: scoreWordmeaningV11,
    ...wordmeaningRegistryMetaV11,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
