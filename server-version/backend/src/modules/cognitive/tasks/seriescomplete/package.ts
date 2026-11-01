import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { seriescompleteConfigSchema } from '../../schemas/seriescomplete.config'
import { seriescompleteTrialSchema } from '../../schemas/seriescomplete.trial'
import { scoreSeriescompleteV1 } from '../../scoring/seriescomplete.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { seriescompleteRegistryMeta } from './definitions'

const seriescompleteFinalSubmission = fixedCountFinalSubmission('totalTrials')

import { seriescompleteConfigV11Schema } from './config-v1.1'
import { scoreSeriescompleteV11 } from '../../scoring/seriescomplete.v1.1'
import { seriescompleteRegistryMetaV11 } from './definitions-v1.1'

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
    recommendedForCreate: false,
  },
  { testType: 'seriescomplete', engineVersion: '1.1.0', scoringVersion: '1.1.0', configSchema: seriescompleteConfigV11Schema, trialSchema: seriescompleteTrialSchema, finalSubmission: seriescompleteFinalSubmission, score: scoreSeriescompleteV11, ...seriescompleteRegistryMetaV11 },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
