import { gonogoConfigSchema } from '../../schemas/gonogo.config'
import { gonogoTrialSchema } from '../../schemas/gonogo.trial'
import { scoreGonogoV1 } from '../../scoring/gonogo.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { gonogoRegistryMeta } from './definitions'

const gonogoFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const gonogoTaskPackage = defineCognitiveTaskPackage({
  testType: 'gonogo',
  protocolPhases: [
    { key: 'test', persists: true, required: true },
  ],
  qualityEffects: {
    excessiveOmissions: 'limited',
    extremeCommissionRate: 'limited',
    insufficientNoGoTrials: 'limited',
    interpretable: 'none',
    interrupted: 'limited',
  },
  entries: [
  {
  testType: 'gonogo',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: gonogoConfigSchema,
  trialSchema: gonogoTrialSchema,
  finalSubmission: gonogoFinalSubmission,
  score: scoreGonogoV1,
  ...gonogoRegistryMeta,
}
  ],
})
