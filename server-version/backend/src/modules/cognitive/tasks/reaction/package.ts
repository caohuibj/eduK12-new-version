import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { reactionConfigSchema } from '../../schemas/reaction.config'
import { reactionTrialSchema } from '../../schemas/reaction.trial'
import { scoreReactionV1 } from '../../scoring/reaction.v1'
import { scoreReactionV1_1 } from '../../scoring/reaction.v1_1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { reactionRegistryMeta, reactionRegistryMetaV11 } from './definitions'

const reactionFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
{
  testType: 'reaction',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: reactionConfigSchema,
  trialSchema: reactionTrialSchema,
  finalSubmission: reactionFinalSubmission,
  score: scoreReactionV1,
  ...reactionRegistryMeta,
},
{
  testType: 'reaction',
  engineVersion: '1.0.0',
  scoringVersion: '1.1.0',
  configSchema: reactionConfigSchema,
  trialSchema: reactionTrialSchema,
  finalSubmission: reactionFinalSubmission,
  score: scoreReactionV1_1,
  ...reactionRegistryMetaV11,
}
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
