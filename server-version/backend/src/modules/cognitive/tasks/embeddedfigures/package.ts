import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { embeddedfiguresConfigSchema } from '../../schemas/embeddedfigures.config'
import { embeddedfiguresTrialSchema } from '../../schemas/embeddedfigures.trial'
import { scoreEmbeddedfiguresV1 } from '../../scoring/embeddedfigures.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { embeddedfiguresRegistryMeta, embeddedfiguresV2Meta } from './definitions'

import {embeddedfiguresV2ConfigSchema} from '../../schemas/embeddedfigures.v2.config'
import {scoreEmbeddedfiguresV2} from '../../scoring/embeddedfigures.v2'

const embeddedfiguresFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'embeddedfigures',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: embeddedfiguresConfigSchema,
    trialSchema: embeddedfiguresTrialSchema,
    finalSubmission: embeddedfiguresFinalSubmission,
    score: scoreEmbeddedfiguresV1,
    ...embeddedfiguresRegistryMeta, recommendedForCreate:false,
  },
  {testType:'embeddedfigures',engineVersion:'1.1.0',scoringVersion:'1.1.0',configSchema:embeddedfiguresV2ConfigSchema,trialSchema:embeddedfiguresTrialSchema,finalSubmission:embeddedfiguresFinalSubmission,score:scoreEmbeddedfiguresV2,...embeddedfiguresV2Meta},
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
