import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { cogestConfigSchema } from '../../schemas/cogest.config'
import { cogestTrialSchema } from '../../schemas/cogest.trial'
import { scoreCogestV1 } from '../../scoring/cogest.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { cogestRegistryMeta } from './definitions'

const cogestFinalSubmission = fixedCountFinalSubmission('totalTrials')

import { cogestConfigV11Schema } from './config-v1.1'
import { scoreCogestV11 } from '../../scoring/cogest.v1.1'
import { cogestRegistryMetaV11 } from './definitions-v1.1'

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
    recommendedForCreate: false,
  },
  { testType: 'cogest', engineVersion: '1.1.0', scoringVersion: '1.1.0', configSchema: cogestConfigV11Schema, trialSchema: cogestTrialSchema, finalSubmission: cogestFinalSubmission, score: scoreCogestV11, ...cogestRegistryMetaV11 },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
