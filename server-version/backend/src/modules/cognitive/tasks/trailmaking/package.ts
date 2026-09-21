import type { RegistryEntry } from '../../cognitive.types'
import { trailmakingConfigSchema } from '../../schemas/trailmaking.config'
import { trailmakingTrialSchema } from '../../schemas/trailmaking.trial'
import { scoreTrailmakingV1 } from '../../scoring/trailmaking.v1'
import {
  absoluteFallbackFinalSubmission,
  fixedCountFinalSubmission,
  nbackTaskCountFinalSubmission,
  phaseTaskCountFinalSubmission,
  spanTaskCountFinalSubmission,
  trailmakingTaskCountFinalSubmission,
} from '../../v2/final-submission-budget'
import { trailmakingRegistryMeta } from './definitions'

const trailmakingFinalSubmission = trailmakingTaskCountFinalSubmission()

export const executionEntries = [
{ testType: 'trailmaking', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: trailmakingConfigSchema, trialSchema: trailmakingTrialSchema, finalSubmission: trailmakingFinalSubmission, score: scoreTrailmakingV1, ...trailmakingRegistryMeta }
] as unknown as RegistryEntry<unknown, unknown>[]
