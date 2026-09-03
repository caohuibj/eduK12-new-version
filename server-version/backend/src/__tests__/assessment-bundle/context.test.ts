process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

import { describe, expect, it } from 'vitest'
import { BundleContractError } from '../../modules/assessment-bundle/errors'
import {
  buildBundleContextFactsFromValues,
  contextSnapshotHashIgnoresFrozenAt,
  decryptBundleContextFacts,
  encryptBundleContextFacts,
  freezeBundleContext,
  hashBundleContextDefinition,
  hashBundleContextFacts,
  normalizeBundleContextValues,
  validateBundleContextDefinition,
  type BundleContextDefinitionV1,
} from '../../modules/assessment-bundle'
import { HASH_A } from './fixtures'

const failCode = (run: () => unknown): string => {
  try {
    run()
    throw new Error('expected BundleContractError')
  } catch (error) {
    if (error instanceof BundleContractError) return error.code
    throw error
  }
}

const definition = (
  overrides: Partial<BundleContextDefinitionV1> = {},
): BundleContextDefinitionV1 => validateBundleContextDefinition({
  schemaVersion: 1,
  contextDefinitionKey: 'bundle-context-demo-v1',
  contextDefinitionVersion: '1.0.0',
  fields: [
    { contextKey: 'grade', required: true, valueType: 'enum', enumValues: ['7', '8', '9'] },
    { contextKey: 'sleep_hours', required: false, valueType: 'number' },
    { contextKey: 'notes', required: false, valueType: 'string' },
    { contextKey: 'consent', required: true, valueType: 'boolean' },
  ],
  ...overrides,
})

describe('Bundle Context definition / freeze / encryption', () => {
  it('validates required/optional/type/enum and normalizes values', () => {
    const def = definition()
    expect(hashBundleContextDefinition(def)).toMatch(/^[0-9a-f]{64}$/)

    const facts = normalizeBundleContextValues({
      definition: def,
      values: { grade: '8', consent: true, sleep_hours: 7.5 },
    })
    expect(facts).toEqual([
      { contextKey: 'grade', value: { state: 'present', value: '8' } },
      { contextKey: 'sleep_hours', value: { state: 'present', value: 7.5 } },
      { contextKey: 'notes', value: { state: 'missing' } },
      { contextKey: 'consent', value: { state: 'present', value: true } },
    ])

    expect(failCode(() => normalizeBundleContextValues({
      definition: def,
      values: { consent: true },
    }))).toBe('CONTEXT_VALUE_INVALID')

    expect(failCode(() => normalizeBundleContextValues({
      definition: def,
      values: { grade: '10', consent: true },
    }))).toBe('CONTEXT_VALUE_INVALID')

    expect(failCode(() => normalizeBundleContextValues({
      definition: def,
      values: { grade: '8', consent: 'yes' },
    }))).toBe('CONTEXT_VALUE_INVALID')

    expect(failCode(() => validateBundleContextDefinition({
      ...def,
      fields: [
        { contextKey: 'grade', required: true, valueType: 'enum' },
      ],
    }))).toBe('CONTEXT_DEFINITION_INVALID')
  })

  it('freezes idempotently, writes frozenAt, and excludes frozenAt from hash', () => {
    const def = definition()
    const first = freezeBundleContext({
      definition: def,
      values: { grade: '8', consent: true },
      frozenAt: '2026-09-03T01:00:00.000Z',
    })
    expect(first.idempotentReplay).toBe(false)
    expect(first.facts.frozenAt).toBe('2026-09-03T01:00:00.000Z')
    expect(first.state.contextSnapshotEncrypted.split(':')).toHaveLength(3)
    expect(contextSnapshotHashIgnoresFrozenAt(first.facts)).toBe(true)

    const replay = freezeBundleContext({
      definition: def,
      values: { grade: '8', consent: true },
      frozenAt: '2026-09-03T09:00:00.000Z',
      previous: first.state,
    })
    expect(replay.idempotentReplay).toBe(true)
    expect(replay.state.contextSnapshotHash).toBe(first.state.contextSnapshotHash)
    expect(replay.facts.frozenAt).toBe(first.facts.frozenAt)

    // Different frozenAt on a fresh build still yields the same hash.
    const later = buildBundleContextFactsFromValues({
      definition: def,
      values: { grade: '8', consent: true },
      frozenAt: '2026-12-01T00:00:00.000Z',
    })
    expect(later.contextSnapshotHash).toBe(first.facts.contextSnapshotHash)
    expect(later.frozenAt).not.toBe(first.facts.frozenAt)
    expect(hashBundleContextFacts(later)).toBe(later.contextSnapshotHash)
  })

  it('rejects mutate-after-freeze, bad ciphertext, and definition version mismatch', () => {
    const def = definition()
    const frozen = freezeBundleContext({
      definition: def,
      values: { grade: '8', consent: true },
      frozenAt: '2026-09-03T01:00:00.000Z',
    })

    expect(failCode(() => freezeBundleContext({
      definition: def,
      values: { grade: '9', consent: true },
      previous: frozen.state,
    }))).toBe('CONTEXT_MUTATE_AFTER_FREEZE')

    expect(failCode(() => decryptBundleContextFacts('not-ciphertext'))).toBe('CONTEXT_CIPHERTEXT_INVALID')
    expect(failCode(() => decryptBundleContextFacts('aa:bb:cc'))).toBe('CONTEXT_CIPHERTEXT_INVALID')

    const otherVersion = definition({ contextDefinitionVersion: '1.0.1' })
    expect(failCode(() => freezeBundleContext({
      definition: otherVersion,
      values: { grade: '8', consent: true },
      previous: frozen.state,
    }))).toBe('CONTEXT_DEFINITION_VERSION_MISMATCH')

    // Tampered definition hash with same key/version.
    expect(failCode(() => freezeBundleContext({
      definition: def,
      values: { grade: '8', consent: true },
      previous: {
        ...frozen.state,
        contextDefinitionHash: HASH_A,
      },
    }))).toBe('CONTEXT_DEFINITION_VERSION_MISMATCH')
  })

  it('round-trips encryption without requiring submit to re-read raw form rows', () => {
    const def = definition()
    // Caller supplies already-collected values (no form-row I/O in this module).
    const facts = buildBundleContextFactsFromValues({
      definition: def,
      values: { grade: '7', consent: false, notes: 'ok' },
      frozenAt: '2026-09-03T02:00:00.000Z',
    })
    const encrypted = encryptBundleContextFacts(facts)
    const decrypted = decryptBundleContextFacts(encrypted)
    expect(decrypted).toEqual(facts)
  })
  it('rejects non-strict frozenAt and mismatched previous.state.frozenAt', () => {
    const def = definition()
    expect(failCode(() => freezeBundleContext({
      definition: def,
      values: { grade: '8', consent: true },
      frozenAt: '2026-09-03T99:00:00.000Z',
    }))).toBe('CONTEXT_VALUE_INVALID')

    const first = freezeBundleContext({
      definition: def,
      values: { grade: '8', consent: true },
      frozenAt: '2026-09-03T01:00:00.000Z',
    })
    expect(failCode(() => freezeBundleContext({
      definition: def,
      values: { grade: '8', consent: true },
      previous: {
        ...first.state,
        frozenAt: '2026-09-03T02:00:00.000Z',
      },
    }))).toBe('CONTEXT_CIPHERTEXT_INVALID')
  })

})
