import { randomInt as cryptoRandomInt } from 'node:crypto'
import { z } from 'zod'
import { canonicalHash, retainImmutableCanonicalValue } from '../assessment-runtime/canonical'
import { assessmentKeySchema } from './definition-primitives'

/** Selection is entry-neutral. Adapters supply ordered, already validated content
 * identities; this module never rewrites the scientific identity of a unit. */
export const WEIGHTED_VARIANT_ALGORITHM = 'WEIGHTED_RANDOM_INT_V1' as const
const idSchema = z.string().min(1).max(200)
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/)
const unitReferenceSchema = z.object({
  type: z.enum(['FORM_SECTION', 'ITEM']),
  id: idSchema,
}).strict()

const groupSchema = z.object({
  variantKey: assessmentKeySchema,
  label: z.string().trim().min(1).max(200),
  weight: z.number().int().min(1).max(100),
  units: z.array(unitReferenceSchema).min(1).max(2000),
}).strict()

export const weightedVariantConfigSchema = z.object({
  schemaVersion: z.literal(1),
  groups: z.array(groupSchema).min(2).max(8),
}).strict()
export type WeightedVariantConfig = z.infer<typeof weightedVariantConfigSchema>
export type WeightedVariantUnitReference = z.infer<typeof unitReferenceSchema>

const formSectionSchema = z.object({
  type: z.literal('FORM_SECTION'),
  id: idSchema,
  definitionHash: hashSchema,
  itemIds: z.array(idSchema).min(1).max(2000),
  contextSection: z.boolean().optional(),
  conditionReferences: z.array(z.object({
    itemId: idSchema,
    sourceItemId: idSchema,
  }).strict()).max(2000).optional(),
}).strict()
const unionItemSchema = z.object({
  type: z.literal('ITEM'),
  id: idSchema,
  definitionHash: hashSchema,
}).strict()
const unionSchema = z.object({
  units: z.array(z.discriminatedUnion('type', [formSectionSchema, unionItemSchema])).min(1).max(2000),
}).strict()
export type WeightedVariantUnion = z.infer<typeof unionSchema>

const compiledGroupSchema = groupSchema.extend({
  selectedItemIds: z.array(idSchema).min(1).max(10000),
  selectedSectionIds: z.array(idSchema).max(2000),
}).strict()
const compiledSchema = z.object({
  schemaVersion: z.literal(1),
  algorithm: z.literal(WEIGHTED_VARIANT_ALGORITHM),
  configDigest: hashSchema,
  unionDigest: hashSchema,
  union: unionSchema,
  groups: z.array(compiledGroupSchema).min(2).max(8),
}).strict()
export type CompiledWeightedVariants = z.infer<typeof compiledSchema>
export type WeightedVariantProjection = z.infer<typeof compiledGroupSchema>

const identitySchema = z.object({
  compositeId: idSchema,
  attemptId: idSchema,
  participantKey: idSchema,
  attemptEpoch: z.number().int().positive().safe(),
  publishedAt: z.string().datetime({ offset: true }),
}).strict()
export type WeightedVariantAllocationIdentity = z.infer<typeof identitySchema>

const allocationSchema = identitySchema.extend({
  schemaVersion: z.literal(1),
  algorithm: z.literal(WEIGHTED_VARIANT_ALGORITHM),
  configDigest: hashSchema,
  unionDigest: hashSchema,
  variantKey: assessmentKeySchema,
  assignedAt: z.string().datetime({ offset: true }),
  selectedItemIds: z.array(idSchema).min(1).max(10000),
  selectedSectionIds: z.array(idSchema).max(2000),
  allocationHash: hashSchema,
}).strict()
export type WeightedVariantAllocation = z.infer<typeof allocationSchema>
export type WeightedVariantRandomInt = (maxExclusive: number) => number

export class WeightedVariantValidationError extends Error {
  readonly statusCode = 400
  constructor(message: string) {
    super(message)
    this.name = 'WeightedVariantValidationError'
  }
}
const invalid = (message: string): never => { throw new WeightedVariantValidationError(message) }
const unitKey = (unit: WeightedVariantUnitReference): string => `${unit.type}:${unit.id}`
const same = (left: unknown, right: unknown): boolean => canonicalHash(left) === canonicalHash(right)
// Only instances returned by this module skip reparsing. Persisted JSON and
// structurally compatible caller objects are always verified, never trusted casts.
const verifiedCompiled = new WeakSet<object>()

export const compileWeightedVariants = (configInput: unknown, unionInput: unknown): CompiledWeightedVariants => {
  const config = weightedVariantConfigSchema.parse(configInput)
  const union = unionSchema.parse(unionInput)
  const unionIndexes = new Map<string, number>()
  const allItemIds = new Set<string>()
  const contextUnits: string[] = []
  for (const [index, unit] of union.units.entries()) {
    const key = unitKey(unit)
    if (unionIndexes.has(key)) invalid('Weighted variant union contains a duplicate unit')
    unionIndexes.set(key, index)
    const itemIds = unit.type === 'FORM_SECTION' ? unit.itemIds : [unit.id]
    for (const itemId of itemIds) {
      if (allItemIds.has(itemId)) invalid('Weighted variant union contains a duplicate item')
      allItemIds.add(itemId)
      if (allItemIds.size > 10000) invalid('Weighted variant union exceeds the item budget')
    }
    if (unit.type === 'FORM_SECTION') {
      if (unit.contextSection) {
        if (index !== 0 || contextUnits.length) invalid('Context Form section must be the sole first context section')
        contextUnits.push(key)
      }
      // The entry's existing Form policy permits earlier questions in the same
      // section only. Whole-section selection must not relax that policy.
      const indexes = new Map(unit.itemIds.map((itemId, itemIndex) => [itemId, itemIndex]))
      const conditionalItems = new Set<string>()
      for (const reference of unit.conditionReferences ?? []) {
        const target = indexes.get(reference.itemId), source = indexes.get(reference.sourceItemId)
        if (target === undefined || source === undefined || source >= target) {
          invalid('Form conditions must reference an earlier item in the same complete section')
        }
        if (conditionalItems.has(reference.itemId)) invalid('Form condition target is duplicated')
        conditionalItems.add(reference.itemId)
      }
    }
  }
  const variantKeys = new Set<string>(), covered = new Set<string>()
  const groups = config.groups.map((group): WeightedVariantProjection => {
    if (variantKeys.has(group.variantKey)) invalid('Weighted variant keys must be unique')
    variantKeys.add(group.variantKey)
    const selected = new Set<string>()
    const selectedItemIds: string[] = [], selectedSectionIds: string[] = []
    let previousIndex = -1
    for (const reference of group.units) {
      const key = unitKey(reference), index = unionIndexes.get(key)
      if (index === undefined) return invalid('Weighted variant references an unknown unit or a partial Form section')
      if (selected.has(key)) invalid('Weighted variant contains a duplicate unit')
      if (index <= previousIndex) invalid('Weighted variant units must preserve union order')
      previousIndex = index
      selected.add(key); covered.add(key)
      const unit = union.units[index]
      if (unit.type === 'FORM_SECTION') {
        selectedSectionIds.push(unit.id)
        selectedItemIds.push(...unit.itemIds)
      } else selectedItemIds.push(unit.id)
    }
    for (const contextKey of contextUnits) {
      if (!selected.has(contextKey)) invalid('Every weighted variant must include the shared first context Form section')
    }
    return { ...group, selectedItemIds, selectedSectionIds }
  })
  if (covered.size !== union.units.length) invalid('Weighted variants must cover the complete union')
  const unionDigest = canonicalHash({ kind: 'WEIGHTED_VARIANT_UNION', schemaVersion: 1, units: union.units })
  const configDigest = canonicalHash({
    kind: 'WEIGHTED_VARIANTS', schemaVersion: 1, algorithm: WEIGHTED_VARIANT_ALGORITHM,
    unionDigest, groups: config.groups,
  })
  const compiled: CompiledWeightedVariants = retainImmutableCanonicalValue({
    schemaVersion: 1, algorithm: WEIGHTED_VARIANT_ALGORITHM, configDigest, unionDigest, union, groups,
  })
  verifiedCompiled.add(compiled)
  return compiled
}

/** Verify serialized frozen definitions before using their membership or weights. */
export const parseCompiledWeightedVariants = (input: unknown): CompiledWeightedVariants => {
  if (input && typeof input === 'object' && verifiedCompiled.has(input)) return input as CompiledWeightedVariants
  const parsed = compiledSchema.parse(input)
  const compiled = compileWeightedVariants({
    schemaVersion: 1,
    groups: parsed.groups.map(({ variantKey, label, weight, units }) => ({ variantKey, label, weight, units })),
  }, parsed.union)
  if (!same(parsed, compiled)) invalid('Frozen weighted variant configuration digest or membership mismatch')
  return compiled
}

export const projectWeightedVariant = (input: CompiledWeightedVariants, variantKey: string): WeightedVariantProjection => {
  const compiled = parseCompiledWeightedVariants(input)
  const group = compiled.groups.find(candidate => candidate.variantKey === variantKey)
  if (!group) return invalid('Selected weighted variant key is unknown')
  return group
}

/** The injectable source is a pure-function testing seam, never request/config
 * data. Production callers omit it and use unbiased crypto.randomInt. */
export const drawWeightedVariant = (
  input: CompiledWeightedVariants,
  randomInt: WeightedVariantRandomInt = cryptoRandomInt,
): WeightedVariantProjection => {
  const compiled = parseCompiledWeightedVariants(input)
  const total = compiled.groups.reduce((sum, group) => sum + group.weight, 0)
  let ticket = randomInt(total)
  if (!Number.isSafeInteger(ticket) || ticket < 0 || ticket >= total) invalid('Weighted random draw is outside the exclusive integer range')
  for (const group of compiled.groups) {
    if (ticket < group.weight) return group
    ticket -= group.weight
  }
  return invalid('Weighted random draw could not select a group')
}

export const createWeightedVariantAllocation = (
  input: CompiledWeightedVariants,
  identityInput: WeightedVariantAllocationIdentity,
  options: { assignedAt?: string; randomInt?: WeightedVariantRandomInt } = {},
): WeightedVariantAllocation => {
  const compiled = parseCompiledWeightedVariants(input)
  const identity = identitySchema.parse(identityInput)
  const group = drawWeightedVariant(compiled, options.randomInt)
  const unsigned = {
    ...identity, schemaVersion: 1 as const, algorithm: WEIGHTED_VARIANT_ALGORITHM,
    configDigest: compiled.configDigest, unionDigest: compiled.unionDigest,
    variantKey: group.variantKey, assignedAt: options.assignedAt ?? new Date().toISOString(),
    selectedItemIds: [...group.selectedItemIds], selectedSectionIds: [...group.selectedSectionIds],
  }
  return retainImmutableCanonicalValue(allocationSchema.parse({ ...unsigned, allocationHash: canonicalHash(unsigned) }))
}

/** A digest authenticates content binding, not storage origin. The adapter must
 * persist this in its authenticated immutable attempt record and compare the
 * stored allocationHash; only it decides whether a new allocation may be made. */
export const validateWeightedVariantAllocation = (
  input: unknown,
  compiledInput: CompiledWeightedVariants,
  identityInput: WeightedVariantAllocationIdentity,
): WeightedVariantAllocation => {
  const allocation = allocationSchema.parse(input)
  const compiled = parseCompiledWeightedVariants(compiledInput)
  const identity = identitySchema.parse(identityInput)
  const { allocationHash, ...unsigned } = allocation
  if (canonicalHash(unsigned) !== allocationHash) invalid('Weighted variant allocation hash mismatch')
  for (const key of Object.keys(identity) as Array<keyof WeightedVariantAllocationIdentity>) {
    if (allocation[key] !== identity[key]) invalid('Weighted variant allocation identity mismatch')
  }
  if (allocation.configDigest !== compiled.configDigest || allocation.unionDigest !== compiled.unionDigest) {
    invalid('Weighted variant allocation configuration mismatch')
  }
  const group = projectWeightedVariant(compiled, allocation.variantKey)
  if (!same(allocation.selectedItemIds, group.selectedItemIds) || !same(allocation.selectedSectionIds, group.selectedSectionIds)) {
    invalid('Weighted variant allocation selected membership mismatch')
  }
  return retainImmutableCanonicalValue(allocation)
}
