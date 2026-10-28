import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { cancellationConfigSchema } from '../../schemas/cancellation.config'
import { cancellationTrialSchema } from '../../schemas/cancellation.trial'
import { scoreCancellationV1 } from '../../scoring/cancellation.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { cancellationRegistryMeta } from './definitions'

const cancellationFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'cancellation',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: cancellationConfigSchema,
    trialSchema: cancellationTrialSchema,
    finalSubmission: cancellationFinalSubmission,
    score: scoreCancellationV1,
    ...cancellationRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
