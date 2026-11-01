import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { sentencecheckConfigSchema } from '../../schemas/sentencecheck.config'
import { sentencecheckTrialSchema } from '../../schemas/sentencecheck.trial'
import { scoreSentencecheckV1 } from '../../scoring/sentencecheck.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { sentencecheckRegistryMeta, sentencecheckRegistryMetaV11 } from './definitions'
import { scoreSentencecheckV11, sentencecheckConfigV11Schema } from './scoring-v1.1'

const sentencecheckFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'sentencecheck',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    configSchema: sentencecheckConfigSchema,
    trialSchema: sentencecheckTrialSchema,
    finalSubmission: sentencecheckFinalSubmission,
    score: scoreSentencecheckV1,
    ...sentencecheckRegistryMeta,
    recommendedForCreate: false,
  },
  {
    testType: 'sentencecheck',
    engineVersion: '1.1.0',
    scoringVersion: '1.1.0',
    configSchema: sentencecheckConfigV11Schema,
    trialSchema: sentencecheckTrialSchema,
    finalSubmission: sentencecheckFinalSubmission,
    score: scoreSentencecheckV11,
    ...sentencecheckRegistryMetaV11,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
