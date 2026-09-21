import { towerConfigSchema } from '../../schemas/tower.config'
import { towerTrialSchema } from '../../schemas/tower.trial'
import { scoreTowerV1 } from '../../scoring/tower.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { towerRegistryMeta } from './definitions'

const towerFinalSubmission = fixedCountFinalSubmission('problemCount')

export const towerTaskPackage = defineCognitiveTaskPackage({
  testType: 'tower',
  entries: [
  { testType: 'tower', engineVersion: '1.0.0', scoringVersion: '1.0.0', configSchema: towerConfigSchema, trialSchema: towerTrialSchema, finalSubmission: towerFinalSubmission, score: scoreTowerV1, ...towerRegistryMeta }
  ],
})
