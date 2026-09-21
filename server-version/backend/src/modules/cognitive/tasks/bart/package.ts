import type { RegistryEntry } from '../../cognitive.types'
import { bartConfigSchema } from '../../schemas/bart.config'
import { bartTrialSchema } from '../../schemas/bart.trial'
import { scoreBartV1 } from '../../scoring/bart.v1'
import {
  absoluteFallbackFinalSubmission,
  fixedCountFinalSubmission,
  nbackTaskCountFinalSubmission,
  phaseTaskCountFinalSubmission,
  spanTaskCountFinalSubmission,
  trailmakingTaskCountFinalSubmission,
} from '../../v2/final-submission-budget'
import { bartRegistryMeta } from './definitions'

const bartFinalSubmission = fixedCountFinalSubmission('balloonCount')

export const executionEntries = [
{ testType: 'bart', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: bartConfigSchema, trialSchema: bartTrialSchema, finalSubmission: bartFinalSubmission, score: scoreBartV1, ...bartRegistryMeta }
] as unknown as RegistryEntry<unknown, unknown>[]
