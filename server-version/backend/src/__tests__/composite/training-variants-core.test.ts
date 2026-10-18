import { describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import {
  compileWeightedVariants, createWeightedVariantAllocation, drawWeightedVariant,
  parseCompiledWeightedVariants, projectWeightedVariant, validateWeightedVariantAllocation,
  weightedVariantConfigSchema, WEIGHTED_VARIANT_ALGORITHM,
  type WeightedVariantAllocationIdentity, type WeightedVariantConfig, type WeightedVariantUnion,
} from '../../modules/assessment-core/weighted-variants'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const ref = (type: 'FORM_SECTION' | 'ITEM', id: string) => ({ type, id })
const union = (): WeightedVariantUnion => ({ units: [
  { type: 'FORM_SECTION', id: 'context', definitionHash: 'a'.repeat(64), itemIds: ['age', 'school'], contextSection: true },
  { type: 'FORM_SECTION', id: 'form-a', definitionHash: 'b'.repeat(64), itemIds: ['question-a', 'conditional-a'],
    conditionReferences: [{ itemId: 'conditional-a', sourceItemId: 'question-a' }] },
  { type: 'ITEM', id: 'scale-a', definitionHash: 'c'.repeat(64) },
  { type: 'FORM_SECTION', id: 'form-b', definitionHash: 'd'.repeat(64), itemIds: ['question-b'] },
  { type: 'ITEM', id: 'cognitive-b', definitionHash: 'e'.repeat(64) },
] })
const config = (): WeightedVariantConfig => ({ schemaVersion: 1, groups: [
  { variantKey: 'group_a', label: '甲组', weight: 25, units: [ref('FORM_SECTION', 'context'), ref('FORM_SECTION', 'form-a'), ref('ITEM', 'scale-a')] },
  { variantKey: 'group_b', label: '乙组', weight: 75, units: [ref('FORM_SECTION', 'context'), ref('FORM_SECTION', 'form-b'), ref('ITEM', 'cognitive-b')] },
] })
const compile = () => compileWeightedVariants(config(), union())
const identity: WeightedVariantAllocationIdentity = {
  compositeId: 'training-1', attemptId: 'attempt-1', participantKey: 'participant-1', attemptEpoch: 1,
  publishedAt: '2026-10-18T08:00:00.000Z',
}
const assignedAt = '2026-10-18T09:00:00.000Z'
const allocation = () => createWeightedVariantAllocation(compile(), identity, { assignedAt, randomInt: () => 0 })
const rehashAllocation = (value: ReturnType<typeof allocation>) => {
  const { allocationHash: _hash, ...unsigned } = value
  return { ...unsigned, allocationHash: canonicalHash(unsigned) }
}

describe('Training whole-section weighted variants pure core', () => {
  it('projects complete Form sections and non-Form items in frozen union order', () => {
    const source = union(), before = clone(source), compiled = compileWeightedVariants(config(), source)
    expect(source).toEqual(before)
    expect(compiled.algorithm).toBe(WEIGHTED_VARIANT_ALGORITHM)
    expect(projectWeightedVariant(compiled, 'group_a')).toMatchObject({
      selectedItemIds: ['age', 'school', 'question-a', 'conditional-a', 'scale-a'],
      selectedSectionIds: ['context', 'form-a'],
    })
    expect(projectWeightedVariant(compiled, 'group_b')).toMatchObject({
      selectedItemIds: ['age', 'school', 'question-b', 'cognitive-b'],
      selectedSectionIds: ['context', 'form-b'],
    })
    expect(compiled.union.units.map(unit => unit.definitionHash)).toEqual(source.units.map(unit => unit.definitionHash))
    expect(() => projectWeightedVariant(compiled, 'missing')).toThrow(/unknown/)
  })

  it('retains context-free Training tasks and allows shared content without duplication within a group', () => {
    const source = union(), authoring = config()
    source.units.shift()
    authoring.groups.forEach(group => group.units.shift())
    authoring.groups[1].units.splice(0, 0, ref('ITEM', 'scale-a'))
    expect(compileWeightedVariants(authoring, source).groups[1].selectedItemIds).toEqual(['scale-a', 'question-b', 'cognitive-b'])
  })

  it('uses deterministic digests with original content hashes and no caller mutation', () => {
    const authoring = config(), source = union(), compiled = compileWeightedVariants(authoring, source)
    const reorderedKeys = { groups: authoring.groups.map(group => ({ units: group.units, weight: group.weight, label: group.label, variantKey: group.variantKey })), schemaVersion: 1 }
    expect(compileWeightedVariants(reorderedKeys, source).configDigest).toBe(compiled.configDigest)
    expect(parseCompiledWeightedVariants(clone(compiled))).toEqual(compiled)
    authoring.groups[0].weight = 99
    source.units[0].definitionHash = 'f'.repeat(64)
    expect(compiled.groups[0].weight).toBe(25)
    expect(compiled.union.units[0].definitionHash).toBe('a'.repeat(64))
    expect(Object.isFrozen(compiled)).toBe(true)
    expect(Object.isFrozen(compiled.groups[0].units[0])).toBe(true)
    expect(Object.isFrozen(compiled.union.units)).toBe(true)
  })

  it.each(['weight', 'label', 'key', 'group-order', 'content', 'item-order', 'union-order'])(
    'binds %s changes in the immutable config digest', change => {
      const source = union(), authoring = config(), original = compile()
      if (change === 'weight') authoring.groups[0].weight++
      if (change === 'label') authoring.groups[0].label = '新标签'
      if (change === 'key') authoring.groups[0].variantKey = 'new_key'
      if (change === 'group-order') authoring.groups.reverse()
      if (change === 'content') source.units[2].definitionHash = 'f'.repeat(64)
      if (change === 'item-order' && source.units[0].type === 'FORM_SECTION') source.units[0].itemIds.reverse()
      if (change === 'union-order') {
        source.units = [source.units[0], source.units[3], source.units[4], source.units[1], source.units[2]]
      }
      expect(compileWeightedVariants(authoring, source).configDigest).not.toBe(original.configDigest)
    },
  )

  it.each([0, 1, 9])('rejects %i groups and accepts the inclusive 2–8 bound', count => {
    const authoring = config()
    authoring.groups = Array.from({ length: count }, (_, index) => ({ ...config().groups[index % 2], variantKey: `group_${index}` }))
    expect(() => compileWeightedVariants(authoring, union())).toThrow()
    authoring.groups = Array.from({ length: 8 }, (_, index) => ({ ...config().groups[index % 2], variantKey: `group_${index}` }))
    expect(compileWeightedVariants(authoring, union()).groups).toHaveLength(8)
  })

  it.each([0, -1, 101, 1.5, NaN, Infinity, '25'])('rejects non-integer or out-of-range weight %s', weight => {
    const authoring = config() as any
    authoring.groups[0].weight = weight
    expect(() => compileWeightedVariants(authoring, union())).toThrow()
  })

  it('supports integer weights 1 and 100 without requiring a total of 100', () => {
    const authoring = config()
    authoring.groups[0].weight = 1; authoring.groups[1].weight = 100
    const random = vi.fn(() => 100)
    expect(drawWeightedVariant(compileWeightedVariants(authoring, union()), random).variantKey).toBe('group_b')
    expect(random).toHaveBeenCalledWith(101)
  })

  it.each(['duplicate-key', 'invalid-key', 'blank-label', 'unknown', 'partial-form', 'duplicate', 'reordered', 'empty', 'uncovered', 'missing-context'])(
    'rejects authoring %s', failure => {
      const authoring = config()
      if (failure === 'duplicate-key') authoring.groups[1].variantKey = authoring.groups[0].variantKey
      if (failure === 'invalid-key') authoring.groups[0].variantKey = 'Group A'
      if (failure === 'blank-label') authoring.groups[0].label = '  '
      if (failure === 'unknown') authoring.groups[0].units.push(ref('ITEM', 'unknown'))
      if (failure === 'partial-form') authoring.groups[0].units[1] = ref('ITEM', 'question-a')
      if (failure === 'duplicate') authoring.groups[0].units.push(ref('ITEM', 'scale-a'))
      if (failure === 'reordered') authoring.groups[0].units.reverse()
      if (failure === 'empty') authoring.groups[0].units = []
      if (failure === 'uncovered') authoring.groups[0].units.pop()
      if (failure === 'missing-context') authoring.groups[1].units.shift()
      expect(() => compileWeightedVariants(authoring, union())).toThrow()
    },
  )

  it.each(['duplicate-unit', 'duplicate-item', 'missing-hash', 'invalid-hash', 'empty-form', 'late-context', 'second-context'])(
    'rejects union %s', failure => {
      const source = union() as any
      if (failure === 'duplicate-unit') source.units.push(clone(source.units[0]))
      if (failure === 'duplicate-item') source.units[3].itemIds = ['age']
      if (failure === 'missing-hash') delete source.units[0].definitionHash
      if (failure === 'invalid-hash') source.units[0].definitionHash = 'unbound'
      if (failure === 'empty-form') source.units[1].itemIds = []
      if (failure === 'late-context') { source.units[0].contextSection = false; source.units[1].contextSection = true }
      if (failure === 'second-context') source.units[1].contextSection = true
      expect(() => compileWeightedVariants(config(), source)).toThrow()
    },
  )

  it.each(['cross-group', 'shared-context', 'unknown', 'forward', 'self', 'duplicate'])(
    'rejects %s conditions instead of broadening existing same-section policy', failure => {
      const source = union(), section = source.units[1]
      if (section.type !== 'FORM_SECTION') throw new Error('Invalid test fixture')
      if (failure === 'cross-group') section.conditionReferences = [{ itemId: 'conditional-a', sourceItemId: 'question-b' }]
      if (failure === 'shared-context') section.conditionReferences = [{ itemId: 'conditional-a', sourceItemId: 'age' }]
      if (failure === 'unknown') section.conditionReferences = [{ itemId: 'unknown', sourceItemId: 'question-a' }]
      if (failure === 'forward') section.conditionReferences = [{ itemId: 'question-a', sourceItemId: 'conditional-a' }]
      if (failure === 'self') section.conditionReferences = [{ itemId: 'question-a', sourceItemId: 'question-a' }]
      if (failure === 'duplicate') section.conditionReferences!.push(clone(section.conditionReferences![0]))
      expect(() => compileWeightedVariants(config(), source)).toThrow(/condition/)
    },
  )

  it('selects all boundary tickets exactly once with the declared relative weights', () => {
    const compiled = compile(), counts = { group_a: 0, group_b: 0 }
    for (let ticket = 0; ticket < 100; ticket++) {
      const random = vi.fn(() => ticket), selected = drawWeightedVariant(compiled, random)
      counts[selected.variantKey as keyof typeof counts]++
      expect(random).toHaveBeenCalledTimes(1)
      expect(random).toHaveBeenCalledWith(100)
    }
    expect(counts).toEqual({ group_a: 25, group_b: 75 })
    expect(drawWeightedVariant(compiled, () => 24).variantKey).toBe('group_a')
    expect(drawWeightedVariant(compiled, () => 25).variantKey).toBe('group_b')
    expect(['group_a', 'group_b']).toContain(drawWeightedVariant(compiled).variantKey)
  })

  it.each([-1, 100, 1000, 0.5, NaN, Infinity])('rejects invalid injected ticket %s without fallback', ticket => {
    expect(() => drawWeightedVariant(compile(), () => ticket)).toThrow(/exclusive integer range/)
  })

  it('does not accept client RNG, selected-group or assignment fields in configuration', () => {
    for (const extra of [{ randomInt: () => 0 }, { selectedVariantKey: 'group_a' }, { seed: 1 }, { assignedAt }]) {
      expect(weightedVariantConfigSchema.safeParse({ ...config(), ...extra }).success).toBe(false)
    }
  })

  it.each(['config-digest', 'union-digest', 'weight', 'membership', 'section-membership', 'source-hash', 'algorithm', 'unknown-field'])(
    'rejects serialized frozen configuration tamper: %s', failure => {
      const value = clone(compile()) as any
      if (failure === 'config-digest') value.configDigest = 'f'.repeat(64)
      if (failure === 'union-digest') value.unionDigest = 'f'.repeat(64)
      if (failure === 'weight') value.groups[0].weight++
      if (failure === 'membership') value.groups[0].selectedItemIds.push('cognitive-b')
      if (failure === 'section-membership') value.groups[0].selectedSectionIds.reverse()
      if (failure === 'source-hash') value.union.units[0].definitionHash = 'f'.repeat(64)
      if (failure === 'algorithm') value.algorithm = 'MATH_RANDOM'
      if (failure === 'unknown-field') value.seed = 1
      expect(() => parseCompiledWeightedVariants(value)).toThrow()
      expect(() => drawWeightedVariant(value, () => 0)).toThrow()
    },
  )

  it('allocates immutable identity-bound provenance that validates without drawing again', () => {
    const compiled = compile(), random = vi.fn(() => 25)
    const value = createWeightedVariantAllocation(compiled, identity, { randomInt: random, assignedAt })
    expect(value).toMatchObject({ ...identity, assignedAt, variantKey: 'group_b', configDigest: compiled.configDigest, unionDigest: compiled.unionDigest })
    expect(value.selectedItemIds).toEqual(compiled.groups[1].selectedItemIds)
    expect(Object.isFrozen(value)).toBe(true)
    expect(Object.isFrozen(value.selectedItemIds)).toBe(true)
    expect(validateWeightedVariantAllocation(clone(value), compiled, identity)).toEqual(value)
    expect(random).toHaveBeenCalledTimes(1)
  })

  it.each(['compositeId', 'attemptId', 'participantKey', 'attemptEpoch', 'publishedAt'] as const)(
    'rejects allocation replay under a different %s', key => {
      const expected = { ...identity, [key]: key === 'attemptEpoch' ? 2 : key === 'publishedAt' ? '2026-10-18T07:00:00.000Z' : 'other' }
      expect(() => validateWeightedVariantAllocation(allocation(), compile(), expected)).toThrow(/identity/)
    },
  )

  it.each(['hash', 'variant', 'items', 'sections', 'reorder', 'config', 'union', 'assigned-at'])(
    'rejects allocation tamper or mismatched projected membership: %s', failure => {
      let value = clone(allocation())
      if (failure === 'hash') value.allocationHash = 'f'.repeat(64)
      if (failure === 'variant') value.variantKey = 'group_b'
      if (failure === 'items') value.selectedItemIds.push('question-b')
      if (failure === 'sections') value.selectedSectionIds.push('form-b')
      if (failure === 'reorder') value.selectedItemIds.reverse()
      if (failure === 'config') value.configDigest = 'f'.repeat(64)
      if (failure === 'union') value.unionDigest = 'f'.repeat(64)
      if (failure === 'assigned-at') value.assignedAt = 'not-a-time'
      // Membership must still fail even when an attacker recalculates a digest;
      // this check is separate from the adapter's authenticated storage boundary.
      if (!['hash', 'assigned-at'].includes(failure)) value = rehashAllocation(value)
      expect(() => validateWeightedVariantAllocation(value, compile(), identity)).toThrow()
    },
  )

  it('rejects allocation under a republished config even when the union stays identical', () => {
    const authoring = config(); authoring.groups[0].weight = 26
    expect(() => validateWeightedVariantAllocation(allocation(), compileWeightedVariants(authoring, union()), identity)).toThrow(/configuration/)
  })
})
