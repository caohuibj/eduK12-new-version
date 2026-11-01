import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { icarmatrixConfigSchema } from '../../schemas/icarmatrix.config'
import { icarmatrixTrialSchema } from '../../schemas/icarmatrix.trial'
import { icarmatrixV2ConfigSchema } from '../../schemas/icarmatrix-v2.config'
import { icarmatrixV2TrialSchema } from '../../schemas/icarmatrix-v2.trial'
import { scoreIcarmatrixV1 } from '../../scoring/icarmatrix.v1'
import { scoreIcarmatrixV2 } from '../../scoring/icarmatrix.v2'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { icarmatrixRegistryMeta, icarmatrixV2RegistryMeta, icarmatrixV21RegistryMeta } from './definitions'

import { icarmatrixV21ConfigSchema } from '../../schemas/icarmatrix-v21.config'
import { scoreIcarmatrixV21 } from '../../scoring/icarmatrix.v21'

const icarmatrixFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'icarmatrix',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: icarmatrixConfigSchema,
    trialSchema: icarmatrixTrialSchema,
    finalSubmission: icarmatrixFinalSubmission,
    score: scoreIcarmatrixV1,
    ...icarmatrixRegistryMeta,
  },
  {
    testType: 'icarmatrix',
    engineVersion: '2.0.0',
    scoringVersion: '1.0.0',
    configSchema: icarmatrixV2ConfigSchema,
    trialSchema: icarmatrixV2TrialSchema,
    finalSubmission: icarmatrixFinalSubmission,
    score: scoreIcarmatrixV2,
    ...icarmatrixV2RegistryMeta,
  },
  {
    testType: 'icarmatrix', engineVersion: '2.1.0', scoringVersion: '1.1.0',
    configSchema: icarmatrixV21ConfigSchema, trialSchema: icarmatrixV2TrialSchema,
    finalSubmission: icarmatrixFinalSubmission, score: scoreIcarmatrixV21,
    ...icarmatrixV21RegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
