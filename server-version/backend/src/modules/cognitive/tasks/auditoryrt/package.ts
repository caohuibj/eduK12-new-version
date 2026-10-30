import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { auditoryrtConfigSchema } from '../../schemas/auditoryrt.config'
import { auditoryrtTrialSchema } from '../../schemas/auditoryrt.trial'
import { scoreAuditoryrtV1 } from '../../scoring/auditoryrt.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { auditoryrtRegistryMeta } from './definitions'

const auditoryrtFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const executionEntries = [
  {
    testType: 'auditoryrt',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: auditoryrtConfigSchema,
    trialSchema: auditoryrtTrialSchema,
    finalSubmission: auditoryrtFinalSubmission,
    score: scoreAuditoryrtV1,
    ...auditoryrtRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
