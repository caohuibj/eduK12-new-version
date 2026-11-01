import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { arithverifyConfigSchema } from '../../schemas/arithverify.config'
import { arithverifyTrialSchema } from '../../schemas/arithverify.trial'
import { scoreArithverifyV1 } from '../../scoring/arithverify.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { arithverifyRegistryMeta } from './definitions'

const arithverifyFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'arithverify',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    configSchema: arithverifyConfigSchema,
    trialSchema: arithverifyTrialSchema,
    finalSubmission: arithverifyFinalSubmission,
    score: scoreArithverifyV1,
    ...arithverifyRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
