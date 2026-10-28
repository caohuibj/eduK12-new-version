import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { ufovConfigSchema } from '../../schemas/ufov.config'
import { ufovTrialSchema } from '../../schemas/ufov.trial'
import { scoreUfovV1 } from '../../scoring/ufov.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { ufovRegistryMeta } from './definitions'

const ufovFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'ufov',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: ufovConfigSchema,
    trialSchema: ufovTrialSchema,
    finalSubmission: ufovFinalSubmission,
    score: scoreUfovV1,
    ...ufovRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
