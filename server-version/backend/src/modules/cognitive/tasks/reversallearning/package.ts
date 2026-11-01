import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { reversallearningConfigSchema } from '../../schemas/reversallearning.config'
import { reversallearningV11ConfigSchema } from '../../schemas/reversallearning.v1.1.config'
import { reversallearningV11RegistryMeta } from './definitions.v1.1'
import { reversallearningTrialSchema } from '../../schemas/reversallearning.trial'
import { scoreReversallearningV1 } from '../../scoring/reversallearning.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { reversallearningRegistryMeta } from './definitions'

const reversallearningFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
{ testType: 'reversallearning', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: reversallearningConfigSchema, trialSchema: reversallearningTrialSchema, finalSubmission: reversallearningFinalSubmission, score: scoreReversallearningV1, ...reversallearningRegistryMeta, recommendedForCreate: false },
{ testType: 'reversallearning', engineVersion: '1.1.0', scoringVersion: '1.0.0', configSchema: reversallearningV11ConfigSchema, trialSchema: reversallearningTrialSchema, finalSubmission: reversallearningFinalSubmission, score: scoreReversallearningV1, ...reversallearningV11RegistryMeta }
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
