import { createHash } from 'crypto'
import type { ProtocolDefinition, SessionConfigSnapshot } from './types'

const sortDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value !== null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortDeep((value as Record<string, unknown>)[key])
        return result
      }, {})
  }
  return value
}
export const canonicalJson = (value: unknown): string => {
  const encoded = JSON.stringify(sortDeep(value))
  if (encoded === undefined) throw new Error('Value is not JSON serializable')
  return encoded
}

export const sha256 = (value: unknown): string =>
  createHash('sha256').update(canonicalJson(value)).digest('hex')

/** Protocol signatures never include a mutable session/config field. */
export const computeProtocolSignature = (protocol: ProtocolDefinition): string => sha256(protocol)

export const computeConfigSnapshotHash = (config: unknown): string => sha256(config)

export const assertProtocolSignature = (snapshot: Pick<SessionConfigSnapshot, 'protocol' | 'protocolSignature'>): void => {
  const expected = computeProtocolSignature(snapshot.protocol)
  if (snapshot.protocolSignature !== expected) {
    throw new Error('protocolSignature does not match the frozen protocol definition')
  }
}
