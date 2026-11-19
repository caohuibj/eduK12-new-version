import { createHash } from 'node:crypto'
import { recordCanonicalOperation } from '../../services/runtimeObservability'

export const CANONICAL_JSON_SHA256_V1 = 'CANONICAL_JSON_SHA256_V1' as const

export class CanonicalJsonError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanonicalJsonError'
  }
}

const quoteJsonString = (value: string): string => {
  const len = value.length
  for (let i = 0; i < len; i++) {
    const c = value.charCodeAt(i)
    // Escape control chars, double-quote, backslash, or surrogate code units
    // via native JSON.stringify so output is bit-for-bit identical to V8.
    if (c < 0x20 || c === 0x22 || c === 0x5c || (c >= 0xd800 && c <= 0xdfff)) {
      return JSON.stringify(value)
    }
  }
  return `"${value}"`
}

const formatPath = (stack: Array<string | number>): string => {
  let out = '$'
  for (let i = 0; i < stack.length; i++) {
    const seg = stack[i]
    out += typeof seg === 'number' ? `[${seg}]` : `.${seg}`
  }
  return out
}

const isArrayIndexKey = (key: string): boolean => {
  const len = key.length
  if (len === 0 || len > 10) return false
  const c0 = key.charCodeAt(0)
  if (c0 < 48 || c0 > 57) return false
  if (c0 === 48) return len === 1
  for (let i = 1; i < len; i++) {
    const c = key.charCodeAt(i)
    if (c < 48 || c > 57) return false
  }
  return len < 10 || Number(key) <= 4294967294
}

/**
 * Return object keys in the exact ECMAScript OrdinaryOwnPropertyKeys order
 * produced by inserting lexically sorted keys into a fresh null-prototype
 * object (array-index keys ascending numerically first, then remaining string
 * keys in lexical code-unit order).
 */
const canonicalSortedKeys = (keys: string[]): string[] => {
  const len = keys.length
  if (len <= 1) return keys
  if (len === 2) {
    const a = keys[0], b = keys[1]
    const aIdx = isArrayIndexKey(a)
    const bIdx = isArrayIndexKey(b)
    if (aIdx !== bIdx) return aIdx ? [a, b] : [b, a]
    if (aIdx) return Number(a) <= Number(b) ? [a, b] : [b, a]
    return a <= b ? [a, b] : [b, a]
  }
  let hasIndex = false
  let sorted = true
  let prev = keys[0]
  if (prev.length > 0) {
    const c0 = prev.charCodeAt(0)
    if (c0 >= 48 && c0 <= 57 && isArrayIndexKey(prev)) hasIndex = true
  }
  for (let i = 1; i < len; i++) {
    const key = keys[i]
    if (!hasIndex && key.length > 0) {
      const c0 = key.charCodeAt(0)
      if (c0 >= 48 && c0 <= 57 && isArrayIndexKey(key)) hasIndex = true
    }
    if (sorted && prev > key) sorted = false
    prev = key
  }
  if (!hasIndex) return sorted ? keys : keys.sort()
  const indexKeys: string[] = []
  const otherKeys: string[] = []
  for (let i = 0; i < len; i++) {
    const key = keys[i]
    if (isArrayIndexKey(key)) indexKeys.push(key)
    else otherKeys.push(key)
  }
  indexKeys.sort((a, b) => Number(a) - Number(b))
  otherKeys.sort()
  return indexKeys.concat(otherKeys)
}

const serializeCanonical = (value: unknown, pathStack: Array<string | number>, active: Set<object>): string => {
  if (value === null) return 'null'
  const kind = typeof value
  if (kind === 'string') return quoteJsonString(value as string)
  if (kind === 'boolean') return value ? 'true' : 'false'
  if (kind === 'number') {
    if (!Number.isFinite(value as number)) throw new CanonicalJsonError(`${formatPath(pathStack)} must be a finite number`)
    return Object.is(value, -0) ? '0' : String(value)
  }
  if (value === undefined) throw new CanonicalJsonError(`${formatPath(pathStack)} must not be undefined`)
  if (kind === 'bigint') throw new CanonicalJsonError(`${formatPath(pathStack)} must not be a bigint`)
  if (kind === 'function') throw new CanonicalJsonError(`${formatPath(pathStack)} must not be a function`)
  if (kind === 'symbol') throw new CanonicalJsonError(`${formatPath(pathStack)} must not be a symbol`)
  if (kind !== 'object') throw new CanonicalJsonError(`${formatPath(pathStack)} has an unsupported type`)

  const obj = value as object
  if (active.has(obj)) throw new CanonicalJsonError(`${formatPath(pathStack)} contains a circular reference`)
  active.add(obj)
  try {
    if (Array.isArray(obj)) {
      const len = obj.length
      if (len === 0) return '[]'
      let out = '['
      for (let i = 0; i < len; i++) {
        if (i > 0) out += ','
        pathStack.push(i)
        out += serializeCanonical(obj[i], pathStack, active)
        pathStack.pop()
      }
      return out + ']'
    }

    const prototype = Object.getPrototypeOf(obj)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalJsonError(`${formatPath(pathStack)} must be a plain object`)
    }
    if (Object.getOwnPropertySymbols(obj).length > 0) {
      throw new CanonicalJsonError(`${formatPath(pathStack)} must not contain symbol keys`)
    }

    const source = obj as Record<string, unknown>
    const keys = canonicalSortedKeys(Object.keys(source))
    const len = keys.length
    if (len === 0) return '{}'
    let out = '{'
    for (let i = 0; i < len; i++) {
      const key = keys[i]
      if (i > 0) out += ','
      pathStack.push(key)
      out += quoteJsonString(key) + ':' + serializeCanonical(source[key], pathStack, active)
      pathStack.pop()
    }
    return out + '}'
  } finally {
    active.delete(obj)
  }
}

export const canonicalJsonString = (value: unknown): string => {
  recordCanonicalOperation(value)
  return serializeCanonical(value, [], new Set<object>())
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
const encodedValue = (value: unknown): Buffer => {
  const cached = process.env.ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED === 'true' && value && typeof value === 'object'
    ? immutableCanonical.get(value) : undefined
  if (cached) { recordCanonicalOperation(value); return cached }
  return canonicalJsonBytes(value)
}
export const canonicalHash = (value: unknown): string => createHash('sha256').update(encodedValue(value)).digest('hex')

/** Same bytes as canonicalHash for a plain record, reusing only registered,
 * deeply immutable child values. Dynamic attempt fields are encoded each time. */
export const canonicalHashObjectParts = (value: Record<string, unknown>): string => {
  if (process.env.ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED !== 'true') return canonicalHash(value)
  const proto = Object.getPrototypeOf(value)
  if ((proto !== Object.prototype && proto !== null) || Object.getOwnPropertySymbols(value).length) {
    throw new CanonicalJsonError('value must be a plain object without symbol keys')
  }
  const keys = canonicalSortedKeys(Object.keys(value))
  const hash = createHash('sha256').update('{')
  keys.forEach((key, index) => { hash.update((index ? ',' : '') + JSON.stringify(key) + ':'); hash.update(encodedValue(value[key])) })
  return hash.update('}').digest('hex')
}
