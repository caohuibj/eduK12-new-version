import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { cogestConfigSchema } from '../../schemas/cogest.config'
import { cogestTrialSchema } from '../../schemas/cogest.trial'
import { scoreCogestV1 } from '../../scoring/cogest.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { cogestRegistryMeta } from './definitions'

const cogestFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'cogest',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: cogestConfigSchema,
    trialSchema: cogestTrialSchema,
    finalSubmission: cogestFinalSubmission,
    score: scoreCogestV1,
    ...cogestRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
