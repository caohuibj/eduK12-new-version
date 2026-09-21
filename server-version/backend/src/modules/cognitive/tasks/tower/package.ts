import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { towerConfigSchema } from '../../schemas/tower.config'
import { towerTrialSchema } from '../../schemas/tower.trial'
import { scoreTowerV1 } from '../../scoring/tower.v1'
import {
  absoluteFallbackFinalSubmission,
  fixedCountFinalSubmission,
  nbackTaskCountFinalSubmission,
  phaseTaskCountFinalSubmission,
  spanTaskCountFinalSubmission,
  trailmakingTaskCountFinalSubmission,
} from '../../v2/final-submission-budget'
import { towerRegistryMeta } from './definitions'

const towerFinalSubmission = fixedCountFinalSubmission('problemCount')

export const executionEntries = [
{ testType: 'tower', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: towerConfigSchema, trialSchema: towerTrialSchema, finalSubmission: towerFinalSubmission, score: scoreTowerV1, ...towerRegistryMeta }
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
