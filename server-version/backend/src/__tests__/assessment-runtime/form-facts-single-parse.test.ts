import { describe, expect, it } from 'vitest'
import { canonicalJsonBytes } from '../../modules/assessment-runtime/canonical'
import {
  createPolicyFormSectionCollectionFacts,
  createTypedFormSectionCollectionFacts,
  readFormSectionCollectionFacts,
} from '../../modules/assessment-runtime/form-facts'

const snapshot = (version: 2 | 3, value: unknown = { row: ['b', 'a'], amount: 2.5 }) => ({
  schemaVersion: version,
  sectionKey: 'section',
  items: [{ key: 'question', label: '原文', value, ...(version === 3 ? { state: 'ANSWERED' as const, rowStates: { row: 'ANSWERED' as const }, otherText: '补充' } : {}) }],
})

// Existing public constructors remain strict parsers. Compare the reader with
// their canonical result, including the old reader's second validation pass.
const oldSecondPass = (facts: ReturnType<typeof readFormSectionCollectionFacts>) => {
  if (facts.schemaVersion === 2) return createTypedFormSectionCollectionFacts(facts)
  if (facts.schemaVersion === 3) return createPolicyFormSectionCollectionFacts(facts)
  throw new Error('Expected typed facts')
}

describe.each([2, 3] as const)('V%s single-parse frozen Form facts reader', version => {
  it('preserves canonical bytes and creates independent nested values', () => {
    const source = snapshot(version)
    const facts = readFormSectionCollectionFacts(source)
    expect(canonicalJsonBytes(facts)).toEqual(canonicalJsonBytes(source))
    expect(canonicalJsonBytes(facts)).toEqual(canonicalJsonBytes(oldSecondPass(facts)))
    const value = source.items[0].value as { row: string[] }
    value.row.push('changed')
    source.items[0].label = 'changed'
    expect(facts.items[0].value).toEqual({ row: ['b', 'a'], amount: 2.5 })
    expect(facts.items[0].label).toBe('原文')
    if (facts.schemaVersion === 3) {
      Object.assign(source.items[0].rowStates!, { row: 'REFUSED' })
      expect(facts.items[0].rowStates).toEqual({ row: 'ANSWERED' })
    }
  })

  it('retains strict unknown-field rejection at both levels', () => {
    expect(() => readFormSectionCollectionFacts({ ...snapshot(version), extra: true })).toThrow()
    const input = snapshot(version)
    expect(() => readFormSectionCollectionFacts({ ...input, items: [{ ...input.items[0], extra: true }] })).toThrow()
  })

  it('rejects duplicate keys and 501 items but permits 500', () => {
    const input = snapshot(version)
    expect(() => readFormSectionCollectionFacts({ ...input, items: [input.items[0], input.items[0]] })).toThrow('Form section fact keys must be unique')
    const items = Array.from({ length: 500 }, (_, i) => ({ ...input.items[0], key: `q${i}` }))
    expect(readFormSectionCollectionFacts({ ...input, items }).items).toHaveLength(500)
    expect(() => readFormSectionCollectionFacts({ ...input, items: [...items, { ...items[0], key: 'q500' }] })).toThrow()
  })

  it('retains the exact canonical byte budget at 512000', () => {
    const input = snapshot(version, '')
    const overhead = canonicalJsonBytes(input).byteLength
    input.items[0].value = 'x'.repeat(512000 - overhead)
    expect(canonicalJsonBytes(readFormSectionCollectionFacts(input)).byteLength).toBe(512000)
    input.items[0].value = 'x'.repeat(512001 - overhead)
    expect(() => readFormSectionCollectionFacts(input)).toThrow('Form section facts exceed 500 KB')
  })

  it.each([NaN, Infinity, -Infinity, { row: NaN }])('rejects invalid numeric facts %j', value => {
    expect(() => readFormSectionCollectionFacts(snapshot(version, value))).toThrow()
  })
})

it('retains V3 absent optional fields and rejects explicit undefined in canonical facts', () => {
  const input = { schemaVersion: 3, sectionKey: 's', items: [{ key: 'q', label: 'Q', value: null, state: 'NOT_SHOWN' }] }
  expect(readFormSectionCollectionFacts(input)).toEqual(input)
  expect(() => readFormSectionCollectionFacts({ ...input, items: [{ ...input.items[0], otherText: undefined }] })).toThrow('must not be undefined')
  expect(() => readFormSectionCollectionFacts({ ...input, items: [{ ...input.items[0], rowStates: undefined }] })).toThrow('must not be undefined')
})

it('leaves historical V1 >500 item reads and wrapped malformed errors unchanged', () => {
  const input = { schemaVersion: 1, sectionKey: 'legacy', items: Array.from({ length: 501 }, (_, i) => ({ key: `q${i}`, label: 'Q', value: null })) }
  expect(readFormSectionCollectionFacts(input)).toEqual(input)
  expect(() => readFormSectionCollectionFacts({ ...input, unexpected: true })).toThrow('Malformed form section facts:')
})
