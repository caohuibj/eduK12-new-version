import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { seqlearnConfigSchema } from '../../schemas/seqlearn.config'
import { seqlearnTrialSchema } from '../../schemas/seqlearn.trial'
import { scoreSeqlearnV1 } from '../../scoring/seqlearn.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { seqlearnRegistryMeta } from './definitions'

const seqlearnFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'seqlearn',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: seqlearnConfigSchema,
    trialSchema: seqlearnTrialSchema,
    finalSubmission: seqlearnFinalSubmission,
    score: scoreSeqlearnV1,
    ...seqlearnRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
