import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { lineangleConfigSchema } from '../../schemas/lineangle.config'
import { lineangleTrialSchema } from '../../schemas/lineangle.trial'
import { scoreLineangleV1 } from '../../scoring/lineangle.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { lineangleRegistryMeta } from './definitions'

const lineangleFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'lineangle',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: lineangleConfigSchema,
    trialSchema: lineangleTrialSchema,
    finalSubmission: lineangleFinalSubmission,
    score: scoreLineangleV1,
    ...lineangleRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
