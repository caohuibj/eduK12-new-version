import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { readingcompConfigSchema } from '../../schemas/readingcomp.config'
import { readingcompTrialSchema } from '../../schemas/readingcomp.trial'
import { scoreReadingcompV1 } from '../../scoring/readingcomp.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { readingcompRegistryMeta } from './definitions'

const readingcompFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'readingcomp',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: readingcompConfigSchema,
    trialSchema: readingcompTrialSchema,
    finalSubmission: readingcompFinalSubmission,
    score: scoreReadingcompV1,
    ...readingcompRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
