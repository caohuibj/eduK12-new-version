import { createHash } from 'node:crypto'

export const CANONICAL_JSON_SHA256_V1 = 'CANONICAL_JSON_SHA256_V1' as const

export class CanonicalJsonError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanonicalJsonError'
  }
}

const compareLexical = (left: string, right: string): number => {
  if (left === right) return 0
  return left < right ? -1 : 1
}

const normalize = (value: unknown, path: string, active: WeakSet<object>): unknown => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CanonicalJsonError(`${path} must be a finite number`)
    return Object.is(value, -0) ? 0 : value
  }

  if (value === undefined) throw new CanonicalJsonError(`${path} must not be undefined`)
  if (typeof value === 'bigint') throw new CanonicalJsonError(`${path} must not be a bigint`)
  if (typeof value === 'function') throw new CanonicalJsonError(`${path} must not be a function`)
  if (typeof value === 'symbol') throw new CanonicalJsonError(`${path} must not be a symbol`)
  if (typeof value !== 'object') throw new CanonicalJsonError(`${path} has an unsupported type`)

  if (active.has(value)) throw new CanonicalJsonError(`${path} contains a circular reference`)
  active.add(value)
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) => normalize(entry, `${path}[${index}]`, active))
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalJsonError(`${path} must be a plain object`)
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new CanonicalJsonError(`${path} must not contain symbol keys`)
    }

    const source = value as Record<string, unknown>
    return Object.keys(source)
      .sort(compareLexical)
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = normalize(source[key], `${path}.${key}`, active)
        return result
      }, Object.create(null) as Record<string, unknown>)
  } finally {
    active.delete(value)
  }
}

export const canonicalJsonString = (value: unknown): string => {
  const encoded = JSON.stringify(normalize(value, '$', new WeakSet<object>()))
  if (encoded === undefined) throw new CanonicalJsonError('value is not JSON serializable')
  return encoded
}

export const canonicalJsonBytes = (value: unknown): Buffer => Buffer.from(canonicalJsonString(value), 'utf8')

export const canonicalHash = (value: unknown): string => (
  createHash('sha256').update(canonicalJsonBytes(value)).digest('hex')
)
