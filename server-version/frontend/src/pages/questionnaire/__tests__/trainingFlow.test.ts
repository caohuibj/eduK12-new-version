import { describe, expect, it } from 'vitest'
import { createTrainingFlow, parseTrainingFlow, trainingFlowUnitKey, type TrainingFlowAuthoringUnit, type TrainingFlowCondition } from '../trainingFlow'
const units: TrainingFlowAuthoringUnit[] = [
  { id: 'form-1', type: 'FORM_SECTION', label: '前置表单', items: [
    { formDefinition: { itemKey: 'q_single', type: 'SINGLE', prompt: '单选', required: true, options: [{ optionKey: 'yes', label: '是' }, { optionKey: 'no', label: '否' }], rows: [] } },
    { formDefinition: { itemKey: 'q_multi', type: 'MULTIPLE', prompt: '多选', required: true, options: [{ optionKey: 'a', label: 'A' }], rows: [] } },
    { formDefinition: { itemKey: 'q_number', type: 'NUMBER', prompt: '数字', required: false, options: [], rows: [] } },
  ] },
  { id: 'scale-2', type: 'SCALE', label: '量表' },
]
const condition: TrainingFlowCondition = { op: 'EQUALS', field: { source: 'ANSWER', instrumentKey: 'section_form_1', itemKey: 'q_single' }, value: 'yes' }
const withCondition = (when: unknown) => {
  const flow = createTrainingFlow(units)
  flow.blocks[1].when = when as TrainingFlowCondition
  return JSON.stringify(flow)
}
describe('Training flow authoring validation', () => {
  it('uses stable section/item identities and accepts only explicit non-empty config', () => {
    expect(trainingFlowUnitKey(units[0])).toBe('section_form_1')
    expect(trainingFlowUnitKey(units[1])).toBe('item_scale_2')
    expect(parseTrainingFlow('', units)).toBeNull()
    expect(parseTrainingFlow(JSON.stringify(createTrainingFlow(units)), units)?.blocks).toHaveLength(2)
  })
  it('accepts bounded composed predicates without evaluating any answer', () => {
    const when = { op: 'AND', terms: [condition, { op: 'OR', terms: [
      { op: 'NOT', term: { op: 'IS_MISSING', field: condition.field } },
      { op: 'INCLUDES', field: { ...condition.field, itemKey: 'q_multi' }, value: 'a' },
    ] }] }
    expect(parseTrainingFlow(withCondition(when), units)?.blocks[1].when).toEqual(when)
  })
  it.each([
    { ...condition, field: { ...condition.field, instrumentKey: 'item_scale_2' } },
    { ...condition, field: { ...condition.field, itemKey: 'q_number' } },
    { ...condition, value: 'invented' },
    { ...condition, op: 'GT', value: 4 },
    { ...condition, op: 'INCLUDES' },
    { ...condition, op: 'IS_MISSING' },
  ])('rejects unsupported, future, or malformed predicate %#', when => {
    expect(() => parseTrainingFlow(withCondition(when), units)).toThrow()
  })
  it('requires the complete candidate union once, and conditional END after a starting tool', () => {
    const config = createTrainingFlow(units)
    config.blocks.splice(1, 0, { blockKey: 'end', kind: 'END', when: condition, termination: 'SCREEN_OUT' })
    config.blocks.push({ blockKey: 'material', kind: 'MATERIAL', title: '材料', body: '文本' })
    expect(parseTrainingFlow(JSON.stringify(config), units)).toEqual(config)
    config.blocks.pop(); config.blocks.pop()
    expect(() => parseTrainingFlow(JSON.stringify(config), units)).toThrow('全部内容单元')
    expect(() => parseTrainingFlow(JSON.stringify({ schemaVersion: 1, blocks: [{ blockKey: 'end', kind: 'END', termination: 'SCREEN_OUT' }, ...createTrainingFlow(units).blocks] }), units)).toThrow('END')
  })
  it('rejects unknown random policies, duplicate blocks, unsafe text, and excessive recursion', () => {
    expect(() => parseTrainingFlow('{"schemaVersion":1,"blocks":[],"random":true}', units)).toThrow()
    const config = createTrainingFlow(units)
    config.blocks[1].blockKey = config.blocks[0].blockKey
    expect(() => parseTrainingFlow(JSON.stringify(config), units)).toThrow('blockKey')
    config.blocks[1].blockKey = 'second'
    config.blocks.push({ blockKey: 'text', kind: 'MATERIAL', body: '{{answer}}' })
    expect(() => parseTrainingFlow(JSON.stringify(config), units)).toThrow('纯文本')
    let nested: TrainingFlowCondition = condition
    for (let i = 0; i < 8; i++) nested = { op: 'NOT', term: nested }
    expect(() => parseTrainingFlow(withCondition(nested), units)).toThrow('深度')
  })
})
