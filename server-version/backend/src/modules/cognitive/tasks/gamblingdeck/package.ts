import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { gamblingdeckConfigSchema } from '../../schemas/gamblingdeck.config'
import { gamblingdeckTrialSchema } from '../../schemas/gamblingdeck.trial'
import { scoreGamblingdeckV1 } from '../../scoring/gamblingdeck.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { gamblingdeckRegistryMeta } from './definitions'

const gamblingdeckFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'gamblingdeck',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    configSchema: gamblingdeckConfigSchema,
    trialSchema: gamblingdeckTrialSchema,
    finalSubmission: gamblingdeckFinalSubmission,
    score: scoreGamblingdeckV1,
    ...gamblingdeckRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
