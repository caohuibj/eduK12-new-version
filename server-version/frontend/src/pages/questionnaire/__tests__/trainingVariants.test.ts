import { describe, expect, it } from 'vitest'
import { createTrainingVariants, newTrainingVariantGroup, toggleTrainingVariantUnit, validateTrainingVariants, type TrainingAuthoringUnit } from '../trainingVariants'
const units: TrainingAuthoringUnit[] = [
  { id: 'context', type: 'FORM_SECTION', label: '背景', contextSection: true },
  { id: 'scale', type: 'SCALE', label: '量表' },
  { id: 'form', type: 'FORM_SECTION', label: '完整表单' },
]
describe('Training weighted variant authoring model', () => {
  it('creates an explicitly enabled valid configuration with whole units and stable keys', () => {
    const config = createTrainingVariants(units)
    expect(config.groups).toHaveLength(2)
    expect(config.groups[0].units).toEqual([{ type: 'FORM_SECTION', id: 'context' }, { type: 'ITEM', id: 'scale' }, { type: 'FORM_SECTION', id: 'form' }])
    expect(validateTrainingVariants(config, 1, units)).toBeNull()
    config.groups[0].label = '可编辑名称'
    expect(config.groups[0].variantKey).toBe('group_1')
    expect(newTrainingVariantGroup(config.groups, units).variantKey).toBe('group_3')
  })
  it('requires context and keeps global order when selecting a unit again', () => {
    const group = createTrainingVariants(units).groups[0]
    const withoutScale = toggleTrainingVariantUnit(group, { type: 'ITEM', id: 'scale' }, false, units)
    expect(withoutScale.units.map(unit => unit.id)).toEqual(['context', 'form'])
    expect(toggleTrainingVariantUnit(withoutScale, { type: 'ITEM', id: 'scale' }, true, units).units).toEqual(group.units)
    expect(toggleTrainingVariantUnit(group, { type: 'FORM_SECTION', id: 'context' }, false, units).units).toEqual(group.units)
  })
  it.each([0, 101, 1.5, NaN])('rejects invalid maxAttempts %s', value => {
    expect(validateTrainingVariants(createTrainingVariants(units), value, units)).toMatch('1–100')
  })
  it.each([0, 101, 1.5, NaN])('rejects invalid weight %s', value => {
    const config = createTrainingVariants(units)
    config.groups[0].weight = value
    expect(validateTrainingVariants(config, 1, units)).toMatch('权重')
  })
  it('rejects uncovered units, partial Form fields, reordered units and missing context', () => {
    const config = createTrainingVariants(units)
    config.groups.forEach(group => { group.units = group.units.slice(0, 2) })
    expect(validateTrainingVariants(config, 1, units)).toMatch('尚未选择：完整表单')
    const partial = createTrainingVariants(units)
    partial.groups[0].units[2] = { type: 'ITEM', id: 'form-field' }
    expect(validateTrainingVariants(partial, 1, units)).toMatch('内容已变化')
    const reordered = createTrainingVariants(units)
    reordered.groups[0].units.reverse()
    expect(validateTrainingVariants(reordered, 1, units)).toMatch('内容已变化')
    const noContext = createTrainingVariants(units)
    noContext.groups[0].units.shift()
    expect(validateTrainingVariants(noContext, 1, units)).toMatch('共享背景区段')
  })
  it('rejects missing or oversized labels and requires content before enabling', () => {
    const config = createTrainingVariants(units)
    config.groups[0].label = '  '
    expect(validateTrainingVariants(config, 1, units)).toMatch('名称')
    config.groups[0].label = '字'.repeat(201)
    expect(validateTrainingVariants(config, 1, units)).toMatch('名称')
    expect(validateTrainingVariants(createTrainingVariants([]), 1, [])).toMatch('先添加内容')
    expect(validateTrainingVariants(null, 0, [])).toBeNull()
  })
})
