import { describe, expect, it } from 'vitest'
import {
  CanonicalJsonError,
  canonicalHash,
  canonicalHashObjectParts,
  canonicalJsonBytes,
  canonicalJsonString,
  retainImmutableCanonicalValue,
} from '../../modules/assessment-runtime/canonical'

const compareLexical = (left: string, right: string): number => (left === right ? 0 : left < right ? -1 : 1)

/** Reference pre-optimization normalize + JSON.stringify implementation. */
const referenceCanonicalJsonString = (value: unknown): string => {
  const normalize = (node: unknown, path: string, active: WeakSet<object>): unknown => {
    if (node === null || typeof node === 'string' || typeof node === 'boolean') return node
    if (typeof node === 'number') {
      if (!Number.isFinite(node)) throw new CanonicalJsonError(`${path} must be a finite number`)
      return Object.is(node, -0) ? 0 : node
    }
    if (node === undefined) throw new CanonicalJsonError(`${path} must not be undefined`)
    if (typeof node === 'bigint') throw new CanonicalJsonError(`${path} must not be a bigint`)
    if (typeof node === 'function') throw new CanonicalJsonError(`${path} must not be a function`)
    if (typeof node === 'symbol') throw new CanonicalJsonError(`${path} must not be a symbol`)
    if (typeof node !== 'object') throw new CanonicalJsonError(`${path} has an unsupported type`)
    if (active.has(node)) throw new CanonicalJsonError(`${path} contains a circular reference`)
    active.add(node)
    try {
      if (Array.isArray(node)) return node.map((entry, idx) => normalize(entry, `${path}[${idx}]`, active))
      const proto = Object.getPrototypeOf(node)
      if (proto !== Object.prototype && proto !== null) throw new CanonicalJsonError(`${path} must be a plain object`)
      if (Object.getOwnPropertySymbols(node).length > 0) throw new CanonicalJsonError(`${path} must not contain symbol keys`)
      const src = node as Record<string, unknown>
      return Object.keys(src)
        .sort(compareLexical)
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = normalize(src[key], `${path}.${key}`, active)
          return acc
        }, Object.create(null) as Record<string, unknown>)
    } finally {
      active.delete(node)
    }
  }
  return JSON.stringify(normalize(value, '$', new WeakSet<object>()))
}

describe('canonicalJsonString streaming serializer equivalence', () => {
  it('matches reference byte-for-byte across array-index keys, unicode, numbers, and nested whole payloads', () => {
    const nullProto = Object.create(null) as Record<string, unknown>
    nullProto['10'] = 'ten'
    nullProto['2'] = 'two'
    nullProto['0'] = 'zero'
    nullProto['01'] = 'leading-zero'
    nullProto['4294967294'] = 'max-index'
    nullProto['4294967295'] = 'not-index'
    nullProto['-1'] = 'neg'
    nullProto['b'] = 'bee'
    nullProto['a'] = 'aye'

    const samples: unknown[] = [
      null,
      true,
      false,
      0,
      -0,
      42,
      -3.141592653589793,
      1e21,
      1e-7,
      '',
      'hello "world" \\ \n \t \u0000 \u001f 中文 🚀',
      'lone-high-\ud800-and-low-\udfff-surrogates',
      { 'key"quote': 'val\\slash', '\ud800': '\u0007' },
      [],
      {},
      { only: 1 },
      { responseValue: 4, itemCode: 'Q01' },
      { itemCode: 'Q01', responseValue: 'opt_a' },
      { '2': 'b', '10': 'a' },
      { '10': 'a', '2': 'b' },
      { '2': 'b', a: 1 },
      { a: 1, '2': 'b' },
      nullProto,
      {
        submissionId: 'sub-1',
        attemptEpoch: 1,
        contextSnapshotHash: null,
        units: Array.from({ length: 8 }, (_, u) => ({
          itemId: `unit-${u}`,
          definitionHash: 'a'.repeat(64),
          answers: Array.from({ length: 40 }, (_, i) => ({
            responseValue: (i % 5) + 1,
            itemCode: `Q${String(i + 1).padStart(3, '0')}`,
          })),
        })),
      },
    ]

    for (const sample of samples) {
      const actual = canonicalJsonString(sample)
      const expected = referenceCanonicalJsonString(sample)
      expect(actual).toBe(expected)
      expect(canonicalJsonBytes(sample).equals(Buffer.from(expected, 'utf8'))).toBe(true)
    }
  })

  it('matches canonicalHashObjectParts with array-index keys and retained immutable children', () => {
    const prev = process.env.ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED
    process.env.ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED = 'true'
    try {
      const child = retainImmutableCanonicalValue({ z: 1, a: [1, 2, 3] })
      const record = { b: 'two', '10': 'ten', '2': 'two-idx', a: child, '01': 'lead' }
      expect(canonicalHashObjectParts(record)).toBe(canonicalHash(record))
    } finally {
      if (prev === undefined) delete process.env.ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED
      else process.env.ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED = prev
    }
  })

  it('throws CanonicalJsonError on every disallowed value or circular reference', () => {
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    const withSymbolKey = { [Symbol('s')]: 1 }
    const badValues: unknown[] = [
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      10n,
      () => {},
      Symbol('x'),
      new Date(),
      new Map(),
      { a: undefined },
      [1, undefined],
      circular,
      withSymbolKey,
    ]
    for (const bad of badValues) {
      expect(() => canonicalJsonString(bad)).toThrow(CanonicalJsonError)
    }
    expect(() => canonicalJsonString({ items: [{ ok: 1 }, { bad: Number.NaN }] })).toThrow('$.items[1].bad must be a finite number')
  })
})
