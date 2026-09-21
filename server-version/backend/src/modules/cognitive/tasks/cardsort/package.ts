import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { cardsortConfigSchema } from '../../schemas/cardsort.config'
import { cardsortTrialSchema } from '../../schemas/cardsort.trial'
import { scoreCardsortV1 } from '../../scoring/cardsort.v1'
import {
  absoluteFallbackFinalSubmission,
  fixedCountFinalSubmission,
  nbackTaskCountFinalSubmission,
  phaseTaskCountFinalSubmission,
  spanTaskCountFinalSubmission,
  trailmakingTaskCountFinalSubmission,
} from '../../v2/final-submission-budget'
import { cardsortRegistryMeta } from './definitions'

const cardsortFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
{
  testType: 'cardsort',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: cardsortConfigSchema,
  trialSchema: cardsortTrialSchema,
  finalSubmission: cardsortFinalSubmission,
  score: scoreCardsortV1,
  ...cardsortRegistryMeta,
}
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
