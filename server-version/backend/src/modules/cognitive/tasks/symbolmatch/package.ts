import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { symbolmatchConfigSchema } from '../../schemas/symbolmatch.config'
import { symbolmatchTrialSchema } from '../../schemas/symbolmatch.trial'
import { scoreSymbolmatchV1 } from '../../scoring/symbolmatch.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { symbolmatchRegistryMeta } from './definitions'

const symbolmatchFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'symbolmatch',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: symbolmatchConfigSchema,
    trialSchema: symbolmatchTrialSchema,
    finalSubmission: symbolmatchFinalSubmission,
    score: scoreSymbolmatchV1,
    ...symbolmatchRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
