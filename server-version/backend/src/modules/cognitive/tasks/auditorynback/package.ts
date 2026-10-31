import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { auditorynbackConfigSchema } from '../../schemas/auditorynback.config'
import { auditorynbackTrialSchema } from '../../schemas/auditorynback.trial'
import { scoreAuditorynbackV1 } from '../../scoring/auditorynback.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { auditorynbackRegistryMeta } from './definitions'

const auditorynbackFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'auditorynback',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    configSchema: auditorynbackConfigSchema,
    trialSchema: auditorynbackTrialSchema,
    finalSubmission: auditorynbackFinalSubmission,
    score: scoreAuditorynbackV1,
    ...auditorynbackRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
