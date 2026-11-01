import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { runningspanConfigSchema } from '../../schemas/runningspan.config'
import { runningspanTrialSchema } from '../../schemas/runningspan.trial'
import { scoreRunningspanV1 } from '../../scoring/runningspan.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { runningspanRegistryMeta } from './definitions'

const runningspanFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'runningspan',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    configSchema: runningspanConfigSchema,
    trialSchema: runningspanTrialSchema,
    finalSubmission: runningspanFinalSubmission,
    score: scoreRunningspanV1,
    ...runningspanRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
