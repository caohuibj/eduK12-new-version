import { scoreWordanalogyV11 } from '../../scoring/wordanalogy.v1.1'
import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { wordanalogyConfigSchema, wordanalogyConfigSchemaV11 } from '../../schemas/wordanalogy.config'
import { wordanalogyTrialSchema } from '../../schemas/wordanalogy.trial'
import { scoreWordanalogyV1 } from '../../scoring/wordanalogy.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { wordanalogyRegistryMeta, wordanalogyRegistryMetaV11 } from './definitions'

const wordanalogyFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'wordanalogy',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: wordanalogyConfigSchema,
    trialSchema: wordanalogyTrialSchema,
    finalSubmission: wordanalogyFinalSubmission,
    score: scoreWordanalogyV1,
    ...wordanalogyRegistryMeta,
    recommendedForCreate: false,
  },
  {
    testType: 'wordanalogy', engineVersion: '1.1.0', scoringVersion: '1.1.0',
    configSchema: wordanalogyConfigSchemaV11, trialSchema: wordanalogyTrialSchema,
    finalSubmission: wordanalogyFinalSubmission, score: scoreWordanalogyV11,
    ...wordanalogyRegistryMetaV11,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
