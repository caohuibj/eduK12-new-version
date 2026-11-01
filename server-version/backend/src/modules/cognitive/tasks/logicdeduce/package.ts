import { scoreLogicdeduceV2 } from '../../scoring/logicdeduce.v2'
import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { logicdeduceConfigSchema, logicdeduceConfigV2Schema } from '../../schemas/logicdeduce.config'
import { logicdeduceTrialSchema } from '../../schemas/logicdeduce.trial'
import { scoreLogicdeduceV1 } from '../../scoring/logicdeduce.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { logicdeduceRegistryMeta, logicdeduceRegistryMetaV2 } from './definitions'

const logicdeduceFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'logicdeduce',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: logicdeduceConfigSchema,
    trialSchema: logicdeduceTrialSchema,
    finalSubmission: logicdeduceFinalSubmission,
    score: scoreLogicdeduceV1,
    ...logicdeduceRegistryMeta,
  },
  {testType:'logicdeduce',engineVersion:'2.0.0',scoringVersion:'2.0.0',configSchema:logicdeduceConfigV2Schema,trialSchema:logicdeduceTrialSchema,finalSubmission:logicdeduceFinalSubmission,score:scoreLogicdeduceV2,...logicdeduceRegistryMetaV2},
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
