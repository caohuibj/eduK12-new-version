import { decryptField, encryptField, isEncrypted } from '../../utils/encryption'

const UNIFIED_RUNTIME_ENVELOPE_VERSION = 1 as const

interface UnifiedRuntimeEnvelope<T> {
  schemaVersion: typeof UNIFIED_RUNTIME_ENVELOPE_VERSION
  value: T
}

export const encryptUnifiedRuntimePayload = <T>(value: T): string => encryptField<UnifiedRuntimeEnvelope<T>>({
  schemaVersion: UNIFIED_RUNTIME_ENVELOPE_VERSION,
  value,
})

export const decryptUnifiedRuntimePayload = <T>(value: string): T => {
  if (!isEncrypted(value)) throw new Error('Unified runtime payload must use strict encrypted format')
  const envelope = decryptField<UnifiedRuntimeEnvelope<T>>(value)
  if (!envelope || envelope.schemaVersion !== UNIFIED_RUNTIME_ENVELOPE_VERSION) {
    throw new Error('Unsupported unified runtime envelope version')
  }
  return envelope.value
}
