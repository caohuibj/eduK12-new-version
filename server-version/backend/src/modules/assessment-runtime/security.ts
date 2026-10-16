import { isControlReferenceField, decryptControlReference } from './control-reference-codec'
import { compactAssessmentStorageEnabled, encryptCompactField } from './compact-field-codec'
import { decryptField, encryptField, isEncrypted } from '../../utils/encryption'

const UNIFIED_RUNTIME_ENVELOPE_VERSION = 1 as const

interface UnifiedRuntimeEnvelope<T> {
  schemaVersion: typeof UNIFIED_RUNTIME_ENVELOPE_VERSION
  value: T
}

export const encryptUnifiedRuntimePayload = <T>(value: T): string => {
  const envelope: UnifiedRuntimeEnvelope<T> = { schemaVersion: UNIFIED_RUNTIME_ENVELOPE_VERSION, value }
  return compactAssessmentStorageEnabled() ? encryptCompactField(envelope) : encryptField(envelope)
}

export const decryptUnifiedRuntimePayload = <T>(value: string): T => {
  if (isControlReferenceField(value)) return decryptControlReference(value) as T
  if (!isEncrypted(value)) throw new Error('Unified runtime payload must use strict encrypted format')
  const envelope = decryptField<UnifiedRuntimeEnvelope<T>>(value)
  if (!envelope || envelope.schemaVersion !== UNIFIED_RUNTIME_ENVELOPE_VERSION) {
    throw new Error('Unsupported unified runtime envelope version')
  }
  return envelope.value
}
