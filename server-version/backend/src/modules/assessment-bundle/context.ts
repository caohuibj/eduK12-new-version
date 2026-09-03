/**
 * Bundle Context definition, normalization, freeze, and encryption.
 * Reuses V3.2 cognitive payload encryption (strict envelope).
 * Freeze is idempotent; frozenAt is written but never part of contextSnapshotHash.
 * Submit paths must pass already-collected values — never re-read raw form rows here.
 */

import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptCognitivePayload, encryptCognitivePayload } from '../cognitive/cognitive.security'
import {
  buildBundleContextFacts,
  hashBundleContextFacts,
  validateBundleContextFacts,
} from './evidence'
import { bundleContractFail } from './errors'
import { EXACT_VERSION, HEX_HASH, parseContract } from './schema'
import { z } from 'zod'
import {
  BUNDLE_CONTEXT_FACTS_SCHEMA_VERSION,
  type BundleContextFactV1,
  type BundleContextFactsV1,
  type FactPresenceV1,
} from './types'

export const BUNDLE_CONTEXT_DEFINITION_SCHEMA = 1 as const

export type BundleContextValueTypeV1 = 'string' | 'number' | 'boolean' | 'enum'

export interface BundleContextFieldDefinitionV1 {
  contextKey: string
  required: boolean
  valueType: BundleContextValueTypeV1
  /** Required when valueType === 'enum'. */
  enumValues?: string[]
}

export interface BundleContextDefinitionV1 {
  schemaVersion: typeof BUNDLE_CONTEXT_DEFINITION_SCHEMA
  contextDefinitionKey: string
  contextDefinitionVersion: string
  fields: BundleContextFieldDefinitionV1[]
}

export interface BundleContextFreezeStateV1 {
  contextDefinitionKey: string
  contextDefinitionVersion: string
  contextDefinitionHash: string
  contextSnapshotHash: string
  contextSnapshotEncrypted: string
  frozenAt: string
}

const CONTEXT_KEY = /^[a-z][a-z0-9_]*$/

const fieldSchema = z.object({
  contextKey: z.string().regex(CONTEXT_KEY),
  required: z.boolean(),
  valueType: z.enum(['string', 'number', 'boolean', 'enum']),
  enumValues: z.array(z.string().min(1)).optional(),
}).strict()

const definitionSchema = z.object({
  schemaVersion: z.literal(BUNDLE_CONTEXT_DEFINITION_SCHEMA),
  contextDefinitionKey: z.string().min(1),
  contextDefinitionVersion: z.string().regex(EXACT_VERSION),
  fields: z.array(fieldSchema).min(1),
}).strict()

export const hashBundleContextDefinition = (definition: BundleContextDefinitionV1): string => (
  canonicalHash({
    schemaVersion: definition.schemaVersion,
    contextDefinitionKey: definition.contextDefinitionKey,
    contextDefinitionVersion: definition.contextDefinitionVersion,
    fields: definition.fields,
  })
)

export const validateBundleContextDefinition = (
  definition: BundleContextDefinitionV1 | unknown,
): BundleContextDefinitionV1 => {
  const parsed = parseContract(definitionSchema, definition, 'CONTEXT_DEFINITION_INVALID')
  const seen = new Set<string>()
  for (const field of parsed.fields) {
    if (seen.has(field.contextKey)) {
      bundleContractFail('CONTEXT_DEFINITION_INVALID', `contextKey 重复: ${field.contextKey}`)
    }
    seen.add(field.contextKey)
    if (field.valueType === 'enum') {
      const enumValues = field.enumValues
      if (!enumValues || enumValues.length === 0) {
        bundleContractFail('CONTEXT_DEFINITION_INVALID', `enum 字段必须提供 enumValues: ${field.contextKey}`)
      }
      const enumSeen = new Set<string>()
      for (const value of enumValues ?? []) {
        if (enumSeen.has(value)) {
          bundleContractFail('CONTEXT_DEFINITION_INVALID', `enumValues 重复: ${field.contextKey}/${value}`)
        }
        enumSeen.add(value)
      }
    } else if (field.enumValues !== undefined) {
      bundleContractFail('CONTEXT_DEFINITION_INVALID', `非 enum 字段不得提供 enumValues: ${field.contextKey}`)
    }
  }
  return parsed
}

export const parseBundleContextDefinition = (
  value: unknown,
): BundleContextDefinitionV1 => validateBundleContextDefinition(value)

const asPresence = (
  field: BundleContextFieldDefinitionV1,
  raw: unknown,
): FactPresenceV1 => {
  if (raw === undefined || raw === null || raw === '') {
    if (field.required) {
      return bundleContractFail('CONTEXT_VALUE_INVALID', `必填 Context 缺失: ${field.contextKey}`)
    }
    return { state: 'missing' }
  }

  switch (field.valueType) {
    case 'string': {
      if (typeof raw !== 'string') {
        return bundleContractFail('CONTEXT_VALUE_INVALID', `Context 类型必须是 string: ${field.contextKey}`)
      }
      return { state: 'present', value: raw }
    }
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return bundleContractFail('CONTEXT_VALUE_INVALID', `Context 类型必须是 number: ${field.contextKey}`)
      }
      return { state: 'present', value: raw }
    }
    case 'boolean': {
      if (typeof raw !== 'boolean') {
        return bundleContractFail('CONTEXT_VALUE_INVALID', `Context 类型必须是 boolean: ${field.contextKey}`)
      }
      return { state: 'present', value: raw }
    }
    case 'enum': {
      if (typeof raw !== 'string') {
        return bundleContractFail('CONTEXT_VALUE_INVALID', `Context enum 必须是 string: ${field.contextKey}`)
      }
      if (!field.enumValues?.includes(raw)) {
        return bundleContractFail('CONTEXT_VALUE_INVALID', `Context enum 值非法: ${field.contextKey}=${raw}`)
      }
      return { state: 'present', value: raw }
    }
    default:
      return bundleContractFail('CONTEXT_DEFINITION_INVALID', `未知 valueType: ${field.contextKey}`)
  }
}

/**
 * Normalize collected values against a Context definition.
 * Does not read raw form DB rows — callers supply the collected map.
 */
export const normalizeBundleContextValues = (input: {
  definition: BundleContextDefinitionV1
  values: Record<string, unknown>
}): BundleContextFactV1[] => {
  const definition = validateBundleContextDefinition(input.definition)
  const unknownKeys = Object.keys(input.values).filter(
    (key) => !definition.fields.some((field) => field.contextKey === key),
  )
  if (unknownKeys.length > 0) {
    bundleContractFail('CONTEXT_VALUE_INVALID', `未知 Context key: ${unknownKeys.join(',')}`)
  }
  return definition.fields.map((field) => ({
    contextKey: field.contextKey,
    value: asPresence(field, input.values[field.contextKey]),
  }))
}

export const buildBundleContextFactsFromValues = (input: {
  definition: BundleContextDefinitionV1
  values: Record<string, unknown>
  frozenAt?: string | Date
}): BundleContextFactsV1 => {
  const definition = validateBundleContextDefinition(input.definition)
  const frozenAt = input.frozenAt instanceof Date
    ? input.frozenAt.toISOString()
    : (input.frozenAt ?? new Date().toISOString())
  return buildBundleContextFacts({
    contextDefinitionKey: definition.contextDefinitionKey,
    contextDefinitionVersion: definition.contextDefinitionVersion,
    contextDefinitionHash: hashBundleContextDefinition(definition),
    frozenAt,
    facts: normalizeBundleContextValues({ definition, values: input.values }),
  })
}

export const encryptBundleContextFacts = (facts: BundleContextFactsV1): string => (
  encryptCognitivePayload(validateBundleContextFacts(facts))
)

export const decryptBundleContextFacts = (encrypted: string): BundleContextFactsV1 => {
  try {
    return validateBundleContextFacts(decryptCognitivePayload<unknown>(encrypted))
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) throw error
    return bundleContractFail('CONTEXT_CIPHERTEXT_INVALID', 'Bundle Context 密文无效或已损坏')
  }
}

const assertDefinitionMatch = (
  definition: BundleContextDefinitionV1,
  state: Pick<BundleContextFreezeStateV1, 'contextDefinitionKey' | 'contextDefinitionVersion' | 'contextDefinitionHash'>,
): void => {
  const validated = validateBundleContextDefinition(definition)
  if (
    validated.contextDefinitionKey !== state.contextDefinitionKey
    || validated.contextDefinitionVersion !== state.contextDefinitionVersion
  ) {
    bundleContractFail(
      'CONTEXT_DEFINITION_VERSION_MISMATCH',
      `Context definition 版本不符: expected ${state.contextDefinitionKey}@${state.contextDefinitionVersion}`,
    )
  }
  const hash = hashBundleContextDefinition(validated)
  if (hash !== state.contextDefinitionHash) {
    bundleContractFail('CONTEXT_DEFINITION_VERSION_MISMATCH', 'Context definition hash 不匹配')
  }
}

/**
 * Idempotent freeze helper.
 * - No prior freeze → build + encrypt + return new state
 * - Prior freeze with identical snapshot hash → return prior state (idempotent)
 * - Prior freeze with different values → reject mutate-after-freeze
 * - Definition identity/version mismatch vs prior freeze → reject
 */
export const freezeBundleContext = (input: {
  definition: BundleContextDefinitionV1
  values: Record<string, unknown>
  frozenAt?: string | Date
  previous?: BundleContextFreezeStateV1 | null
}): {
  facts: BundleContextFactsV1
  state: BundleContextFreezeStateV1
  idempotentReplay: boolean
} => {
  const definition = validateBundleContextDefinition(input.definition)

  if (input.previous) {
    assertDefinitionMatch(definition, input.previous)
    if (!HEX_HASH.test(input.previous.contextSnapshotHash)) {
      bundleContractFail('CONTEXT_CIPHERTEXT_INVALID', '已冻结 Context snapshot hash 非法')
    }
    const previousFacts = decryptBundleContextFacts(input.previous.contextSnapshotEncrypted)
    if (previousFacts.contextSnapshotHash !== input.previous.contextSnapshotHash) {
      bundleContractFail('CONTEXT_CIPHERTEXT_INVALID', '已冻结 Context 密文与 hash 不一致')
    }

    const candidate = buildBundleContextFactsFromValues({
      definition,
      values: input.values,
      // frozenAt must not affect hash comparison — use previous frozenAt for equality of hash input facts only.
      frozenAt: previousFacts.frozenAt,
    })

    if (candidate.contextSnapshotHash !== input.previous.contextSnapshotHash) {
      bundleContractFail('CONTEXT_MUTATE_AFTER_FREEZE', 'Context 冻结后不得修改')
    }

    return {
      facts: previousFacts,
      state: { ...input.previous },
      idempotentReplay: true,
    }
  }

  const facts = buildBundleContextFactsFromValues({
    definition,
    values: input.values,
    frozenAt: input.frozenAt,
  })
  const encrypted = encryptBundleContextFacts(facts)
  return {
    facts,
    state: {
      contextDefinitionKey: definition.contextDefinitionKey,
      contextDefinitionVersion: definition.contextDefinitionVersion,
      contextDefinitionHash: hashBundleContextDefinition(definition),
      contextSnapshotHash: facts.contextSnapshotHash,
      contextSnapshotEncrypted: encrypted,
      frozenAt: facts.frozenAt,
    },
    idempotentReplay: false,
  }
}

/** Prove frozenAt is excluded from the context snapshot hash. */
export const contextSnapshotHashIgnoresFrozenAt = (
  facts: BundleContextFactsV1,
): boolean => {
  const left = hashBundleContextFacts(facts)
  const right = hashBundleContextFacts({
    ...facts,
    frozenAt: '1970-01-01T00:00:00.000Z',
  })
  return left === right && left === facts.contextSnapshotHash
}

export { BUNDLE_CONTEXT_FACTS_SCHEMA_VERSION }
