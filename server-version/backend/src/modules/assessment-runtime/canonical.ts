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

// Registered values are deeply immutable and have already passed the exact
// canonical encoder. Weak keys cannot retain an evicted artifact by themselves.
const immutableCanonical = new WeakMap<object, Buffer>()
export const hasImmutableCanonicalValue = (value: object): boolean => immutableCanonical.has(value)
export const retainImmutableCanonicalValue = <T extends object>(value: T): T => {
  if (immutableCanonical.has(value)) return value
  const bytes = canonicalJsonBytes(value)
  const seen = new WeakSet<object>()
  const freeze = (node: unknown): void => {
    if (!node || typeof node !== 'object' || seen.has(node)) return
    seen.add(node); for (const child of Object.values(node)) freeze(child); Object.freeze(node)
  }
  freeze(value); immutableCanonical.set(value, bytes); return value
}
const encodedValue = (value: unknown): Buffer => (
  process.env.ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED === 'true' && value && typeof value === 'object'
    ? immutableCanonical.get(value) ?? canonicalJsonBytes(value) : canonicalJsonBytes(value)
)
export const canonicalHash = (value: unknown): string => createHash('sha256').update(encodedValue(value)).digest('hex')

/** Same bytes as canonicalHash for a plain record, reusing only registered,
 * deeply immutable child values. Dynamic attempt fields are encoded each time. */
export const canonicalHashObjectParts = (value: Record<string, unknown>): string => {
  if (process.env.ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED !== 'true') return canonicalHash(value)
  const proto = Object.getPrototypeOf(value)
  if ((proto !== Object.prototype && proto !== null) || Object.getOwnPropertySymbols(value).length) {
    throw new CanonicalJsonError('value must be a plain object without symbol keys')
  }
  // Recreate normal object enumeration so numeric keys match normalize().
  const keys = Object.keys(Object.fromEntries(Object.keys(value).sort(compareLexical).map(key => [key, null])))
  const hash = createHash('sha256').update('{')
  keys.forEach((key, index) => { hash.update((index ? ',' : '') + JSON.stringify(key) + ':'); hash.update(encodedValue(value[key])) })
  return hash.update('}').digest('hex')
}
