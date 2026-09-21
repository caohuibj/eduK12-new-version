import { reactionConfigSchema } from '../../schemas/reaction.config'
import { reactionTrialSchema } from '../../schemas/reaction.trial'
import { scoreReactionV1 } from '../../scoring/reaction.v1'
import { scoreReactionV1_1 } from '../../scoring/reaction.v1_1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { reactionRegistryMeta, reactionRegistryMetaV11 } from './definitions'

const reactionFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const reactionTaskPackage = defineCognitiveTaskPackage({
  testType: 'reaction',
  protocolPhases: [
    { key: 'test', persists: true, required: true },
  ],
  qualityEffects: {
    excessivePremature: 'limited',
    extremeRtPattern: 'limited',
    highMissRate: 'limited',
    insufficientValidTrials: 'limited',
    interpretable: 'none',
    interrupted: 'limited',
  },
  entries: [
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
  ],
})
