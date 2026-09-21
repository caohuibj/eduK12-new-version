import { trailmakingConfigSchema } from '../../schemas/trailmaking.config'
import { trailmakingTrialSchema } from '../../schemas/trailmaking.trial'
import { scoreTrailmakingV1 } from '../../scoring/trailmaking.v1'
import { trailmakingTaskCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { trailmakingRegistryMeta } from './definitions'

const trailmakingFinalSubmission = trailmakingTaskCountFinalSubmission()

export const trailmakingTaskPackage = defineCognitiveTaskPackage({
  testType: 'trailmaking',
  protocolPhases: [
    { key: 'test', persists: true, required: true },
  ],
  qualityEffects: {
    deviceInfoIncomplete: 'none',
    excessiveErrors: 'limited',
    insufficientCompletedSteps: 'limited',
    interpretable: 'none',
    interrupted: 'limited',
    mixedPointerType: 'none',
    timeLimitReached: 'limited',
  },
  entries: [
  { testType: 'trailmaking', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: trailmakingConfigSchema, trialSchema: trailmakingTrialSchema, finalSubmission: trailmakingFinalSubmission, score: scoreTrailmakingV1, ...trailmakingRegistryMeta }
  ],
})
