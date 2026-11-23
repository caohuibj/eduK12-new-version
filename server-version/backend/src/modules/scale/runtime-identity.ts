/** Imported standards keep a storage-only Scale.code. Their server-authored
 * tool key is the identity frozen by the approved C/P/R source. */
export function scaleRuntimeInstrumentKey(scale: {
  code: string
  instrumentClass?: string
  standardSourceKind?: string
  standardToolKey?: string | null
}): string | null {
  if (scale.instrumentClass === 'STANDARD' && scale.standardSourceKind === 'DB_IMPORTED') {
    const key = scale.standardToolKey
    return typeof key === 'string' && key.length > 0 && key === key.trim() ? key : null
  }
  return scale.code
}
