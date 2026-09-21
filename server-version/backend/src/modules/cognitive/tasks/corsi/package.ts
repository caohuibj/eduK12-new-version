import { corsiConfigSchema } from '../../schemas/corsi.config'
import { corsiTrialSchema } from '../../schemas/corsi.trial'
import { scoreCorsiV1 } from '../../scoring/corsi.v1'
import { spanTaskCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { corsiRegistryMeta } from './definitions'

const corsiFinalSubmission = spanTaskCountFinalSubmission('startSpan', 'maxSpan', 'trialsPerLevel')

export const corsiTaskPackage = defineCognitiveTaskPackage({
  testType: 'corsi',
  protocolPhases: [
    { key: 'test', persists: true, required: true },
  ],
  qualityEffects: {
    insufficientCompletedLevels: 'limited',
    interpretable: 'none',
    interrupted: 'limited',
    invalidBlockSequence: 'invalid',
  },
  entries: [
  {
  testType: 'corsi',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: corsiConfigSchema,
  trialSchema: corsiTrialSchema,
  finalSubmission: corsiFinalSubmission,
  score: scoreCorsiV1,
  ...corsiRegistryMeta,
}
  ],
})
