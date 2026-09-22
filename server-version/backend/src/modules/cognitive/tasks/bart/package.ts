import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { bartConfigSchema } from '../../schemas/bart.config'
import { bartTrialSchema } from '../../schemas/bart.trial'
import { scoreBartV1 } from '../../scoring/bart.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { bartRegistryMeta, bartRegistryMetaV11 } from './definitions'

const bartFinalSubmission = fixedCountFinalSubmission('balloonCount')

export const executionEntries = [
{ testType: 'bart', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: bartConfigSchema, trialSchema: bartTrialSchema, finalSubmission: bartFinalSubmission, score: scoreBartV1, ...bartRegistryMeta },
{ testType: 'bart', engineVersion: '1.0.0', scoringVersion: '1.1.0', configSchema: bartConfigSchema, trialSchema: bartTrialSchema, finalSubmission: bartFinalSubmission, score: scoreBartV1, ...bartRegistryMetaV11 }
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
