import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { sizecongruityConfigSchema } from '../../schemas/sizecongruity.config'
import { sizecongruityTrialSchema } from '../../schemas/sizecongruity.trial'
import { scoreSizecongruityV1 } from '../../scoring/sizecongruity.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { sizecongruityRegistryMeta } from './definitions'

const sizecongruityFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'sizecongruity',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: sizecongruityConfigSchema,
    trialSchema: sizecongruityTrialSchema,
    finalSubmission: sizecongruityFinalSubmission,
    score: scoreSizecongruityV1,
    ...sizecongruityRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
