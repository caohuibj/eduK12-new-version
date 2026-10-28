import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { icarmatrixConfigSchema } from '../../schemas/icarmatrix.config'
import { icarmatrixTrialSchema } from '../../schemas/icarmatrix.trial'
import { scoreIcarmatrixV1 } from '../../scoring/icarmatrix.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { icarmatrixRegistryMeta } from './definitions'

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
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
