import { matrixConfigSchema } from '../../schemas/matrix.config'
import { matrixTrialSchema } from '../../schemas/matrix.trial'
import { scoreMatrixV1 } from '../../scoring/matrix.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { matrixRegistryMeta } from './definitions'

const matrixFinalSubmission = fixedCountFinalSubmission('itemCount')

export const matrixTaskPackage = defineCognitiveTaskPackage({
  testType: 'matrix',
  protocolPhases: [
    { key: 'test', persists: true, required: true },
  ],
  qualityEffects: {
    constantResponse: 'limited',
    excessiveOmissions: 'limited',
    interpretable: 'none',
    interrupted: 'limited',
  },
  entries: [
  { testType: 'matrix', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: matrixConfigSchema, trialSchema: matrixTrialSchema, finalSubmission: matrixFinalSubmission, score: scoreMatrixV1, ...matrixRegistryMeta }
  ],
})
