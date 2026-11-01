import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { timecopyConfigSchema } from '../../schemas/timecopy.config'
import { timecopyTrialSchema } from '../../schemas/timecopy.trial'
import { scoreTimecopyV1 } from '../../scoring/timecopy.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { timecopyRegistryMeta } from './definitions'

const timecopyFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'timecopy',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    configSchema: timecopyConfigSchema,
    trialSchema: timecopyTrialSchema,
    finalSubmission: timecopyFinalSubmission,
    score: scoreTimecopyV1,
    ...timecopyRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
