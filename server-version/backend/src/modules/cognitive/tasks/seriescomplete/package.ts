import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { seriescompleteConfigSchema } from '../../schemas/seriescomplete.config'
import { seriescompleteTrialSchema } from '../../schemas/seriescomplete.trial'
import { scoreSeriescompleteV1 } from '../../scoring/seriescomplete.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { seriescompleteRegistryMeta } from './definitions'

const seriescompleteFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'seriescomplete',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: seriescompleteConfigSchema,
    trialSchema: seriescompleteTrialSchema,
    finalSubmission: seriescompleteFinalSubmission,
    score: scoreSeriescompleteV1,
    ...seriescompleteRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
