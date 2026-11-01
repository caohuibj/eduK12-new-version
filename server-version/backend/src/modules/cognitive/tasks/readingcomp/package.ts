import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { readingcompConfigSchema } from '../../schemas/readingcomp.config'
import { readingcompAuditedConfigSchema } from '../../schemas/readingcomp.v1.1.config'
import { readingcompTrialSchema } from '../../schemas/readingcomp.trial'
import { scoreReadingcompV1 } from '../../scoring/readingcomp.v1'
import { scoreReadingcompV11 } from '../../scoring/readingcomp.v1.1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { readingcompRegistryMeta as legacyMeta } from './definitions.v1'
import { readingcompRegistryMeta } from './definitions'

export const executionEntries = [
  { testType: 'readingcomp', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: readingcompConfigSchema,
    trialSchema: readingcompTrialSchema, finalSubmission: fixedCountFinalSubmission('totalTrials'), score: scoreReadingcompV1, ...legacyMeta },
  { testType: 'readingcomp', engineVersion: '1.1.0', scoringVersion: '1.1.0', configSchema: readingcompAuditedConfigSchema,
    trialSchema: readingcompTrialSchema, finalSubmission: fixedCountFinalSubmission('totalTrials'), score: scoreReadingcompV11, ...readingcompRegistryMeta },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
