import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { semanticfluencyConfigSchema } from '../../schemas/semanticfluency.config'
import { semanticfluencyTrialSchema } from '../../schemas/semanticfluency.trial'
import { scoreSemanticfluencyV1 } from '../../scoring/semanticfluency.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { semanticfluencyRegistryMeta } from './definitions'

const semanticfluencyFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'semanticfluency',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    configSchema: semanticfluencyConfigSchema,
    trialSchema: semanticfluencyTrialSchema,
    finalSubmission: semanticfluencyFinalSubmission,
    score: scoreSemanticfluencyV1,
    ...semanticfluencyRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
