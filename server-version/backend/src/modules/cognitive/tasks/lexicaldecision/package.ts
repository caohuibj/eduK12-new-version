import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { lexicaldecisionConfigSchema } from '../../schemas/lexicaldecision.config'
import { lexicaldecisionTrialSchema } from '../../schemas/lexicaldecision.trial'
import { scoreLexicaldecisionV1 } from '../../scoring/lexicaldecision.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { lexicaldecisionRegistryMeta } from './definitions'

const lexicaldecisionFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
{ testType: 'lexicaldecision', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: lexicaldecisionConfigSchema, trialSchema: lexicaldecisionTrialSchema, finalSubmission: lexicaldecisionFinalSubmission, score: scoreLexicaldecisionV1, ...lexicaldecisionRegistryMeta }
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
