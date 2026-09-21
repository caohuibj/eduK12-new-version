import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { mentalrotationConfigSchema } from '../../schemas/mentalrotation.config'
import { mentalrotationTrialSchema } from '../../schemas/mentalrotation.trial'
import { scoreMentalrotationV1 } from '../../scoring/mentalrotation.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { mentalrotationRegistryMeta } from './definitions'

const mentalrotationFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
{ testType: 'mentalrotation', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: mentalrotationConfigSchema, trialSchema: mentalrotationTrialSchema, finalSubmission: mentalrotationFinalSubmission, score: scoreMentalrotationV1, ...mentalrotationRegistryMeta }
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
