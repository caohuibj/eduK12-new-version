import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { auditorynbackConfigSchema } from '../../schemas/auditorynback.config'
import { auditorynbackTrialSchema } from '../../schemas/auditorynback.trial'
import { scoreAuditorynbackV1 } from '../../scoring/auditorynback.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { auditorynbackRegistryMeta } from './definitions'
import { auditorynbackConfigV11Schema } from './config-v11'
import { auditorynbackRegistryMetaV11 } from './definitions-v11'
import { semanticsV11 } from './version-v11'
import { scoreAuditorynbackV11 } from '../../scoring/auditorynback.v1'

const auditorynbackFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'auditorynback',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    configSchema: auditorynbackConfigSchema,
    trialSchema: auditorynbackTrialSchema,
    finalSubmission: auditorynbackFinalSubmission,
    score: scoreAuditorynbackV1,
    ...auditorynbackRegistryMeta,
    recommendedForCreate: false,
  },
  { testType: 'auditorynback', engineVersion: '1.1.0', scoringVersion: '1.1.0', configSchema: auditorynbackConfigV11Schema, trialSchema: auditorynbackTrialSchema, finalSubmission: auditorynbackFinalSubmission, score: scoreAuditorynbackV11, ...auditorynbackRegistryMetaV11 },
].map((entry, index) => ({ ...entry, executionSemantics: index === 0 ? executionSemantics[0] : semanticsV11 })) as unknown as RegistryEntry<unknown, unknown>[]
