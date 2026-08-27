import { decryptField, encryptField, isEncrypted } from '../../utils/encryption'
import { hashAssessmentContext, type AssessmentContextV1 } from './context'

export const encryptAssessmentContext = (context: AssessmentContextV1): string => encryptField(context)

export const decryptAssessmentContext = (value: string): AssessmentContextV1 => {
  if (!isEncrypted(value)) throw new Error('Assessment context 密文格式无效')
  const context = decryptField<AssessmentContextV1>(value)
  if (context.schemaVersion !== 1 || typeof context.frozenAt !== 'string' || !context.values || typeof context.values !== 'object') {
    throw new Error('Assessment context 快照无效')
  }
  return context
}

export const assessmentContextHashMatches = (context: AssessmentContextV1, expectedHash: string | null | undefined): boolean => (
  Boolean(expectedHash && hashAssessmentContext(context) === expectedHash)
)
