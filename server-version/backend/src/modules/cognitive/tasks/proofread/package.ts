import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { proofreadConfigSchema } from '../../schemas/proofread.config'
import { proofreadTrialSchema } from '../../schemas/proofread.trial'
import { scoreProofreadV1 } from '../../scoring/proofread.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { proofreadRegistryMeta } from './definitions'

const proofreadFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'proofread',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: proofreadConfigSchema,
    trialSchema: proofreadTrialSchema,
    finalSubmission: proofreadFinalSubmission,
    score: scoreProofreadV1,
    ...proofreadRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
