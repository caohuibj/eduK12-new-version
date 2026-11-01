import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { matrixConfigSchema, matrixConfigV11Schema } from '../../schemas/matrix.config'
import { matrixTrialSchema } from '../../schemas/matrix.trial'
import { scoreMatrixV1 } from '../../scoring/matrix.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { matrixRegistryMeta, matrixRegistryMetaV11 } from './definitions'

const matrixFinalSubmission = fixedCountFinalSubmission('itemCount')

export const executionEntries = [
{ testType: 'matrix', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: matrixConfigSchema, trialSchema: matrixTrialSchema, finalSubmission: matrixFinalSubmission, score: scoreMatrixV1, ...matrixRegistryMeta },
{testType:'matrix',engineVersion:'1.1.0',scoringVersion:'1.0.0',configSchema:matrixConfigV11Schema,trialSchema:matrixTrialSchema,finalSubmission:matrixFinalSubmission,score:scoreMatrixV1,...matrixRegistryMetaV11}
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
