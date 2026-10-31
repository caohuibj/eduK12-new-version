import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { pursuitrotorConfigSchema } from '../../schemas/pursuitrotor.config'
import { pursuitrotorTrialSchema } from '../../schemas/pursuitrotor.trial'
import { scorePursuitrotorV1 } from '../../scoring/pursuitrotor.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { pursuitrotorRegistryMeta } from './definitions'

const pursuitrotorFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'pursuitrotor',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: pursuitrotorConfigSchema,
    trialSchema: pursuitrotorTrialSchema,
    finalSubmission: pursuitrotorFinalSubmission,
    score: scorePursuitrotorV1,
    ...pursuitrotorRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
