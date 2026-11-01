import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { proofreadConfigSchema } from '../../schemas/proofread.config'
import { proofreadAuditedConfigSchema } from '../../schemas/proofread.v1.1.config'
import { proofreadTrialSchema } from '../../schemas/proofread.trial'
import { scoreProofreadV1 } from '../../scoring/proofread.v1'
import { scoreProofreadV11 } from '../../scoring/proofread.v1.1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { proofreadRegistryMeta as legacyMeta } from './definitions.v1'
import { proofreadRegistryMeta } from './definitions'

export const executionEntries = [
  { testType: 'proofread', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: proofreadConfigSchema,
    trialSchema: proofreadTrialSchema, finalSubmission: fixedCountFinalSubmission('totalTrials'), score: scoreProofreadV1, ...legacyMeta },
  { testType: 'proofread', engineVersion: '1.1.0', scoringVersion: '1.1.0', configSchema: proofreadAuditedConfigSchema,
    trialSchema: proofreadTrialSchema, finalSubmission: fixedCountFinalSubmission('totalTrials'), score: scoreProofreadV11, ...proofreadRegistryMeta },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
