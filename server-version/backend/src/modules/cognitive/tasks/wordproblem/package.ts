import { scoreWordproblemV2 } from '../../scoring/wordproblem.v2'
import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { wordproblemConfigSchema, wordproblemConfigV2Schema } from '../../schemas/wordproblem.config'
import { wordproblemTrialSchema } from '../../schemas/wordproblem.trial'
import { scoreWordproblemV1 } from '../../scoring/wordproblem.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { wordproblemRegistryMeta, wordproblemRegistryMetaV2 } from './definitions'

const wordproblemFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'wordproblem',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: wordproblemConfigSchema,
    trialSchema: wordproblemTrialSchema,
    finalSubmission: wordproblemFinalSubmission,
    score: scoreWordproblemV1,
    ...wordproblemRegistryMeta,
  },
  {testType:'wordproblem',engineVersion:'2.0.0',scoringVersion:'2.0.0',configSchema:wordproblemConfigV2Schema,trialSchema:wordproblemTrialSchema,finalSubmission:wordproblemFinalSubmission,score:scoreWordproblemV2,...wordproblemRegistryMetaV2},
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
