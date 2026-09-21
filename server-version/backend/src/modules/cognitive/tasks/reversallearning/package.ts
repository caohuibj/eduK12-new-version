import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { reversallearningConfigSchema } from '../../schemas/reversallearning.config'
import { reversallearningTrialSchema } from '../../schemas/reversallearning.trial'
import { scoreReversallearningV1 } from '../../scoring/reversallearning.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { reversallearningRegistryMeta } from './definitions'

const reversallearningFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
{ testType: 'reversallearning', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: reversallearningConfigSchema, trialSchema: reversallearningTrialSchema, finalSubmission: reversallearningFinalSubmission, score: scoreReversallearningV1, ...reversallearningRegistryMeta }
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
