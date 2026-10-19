import { describe, expect, it } from 'vitest'
import { addCompositeItemSchema } from '../../modules/composite/composite.schema'
import { normalizeTypedCompositeFormAnswer } from '../../modules/assessment-runtime/typed-form'
import cases from '../assessment-core/fixtures/form-foundation-cases.json'
import golden from '../assessment-core/fixtures/form-foundation-golden.json'
const options = [{ optionKey: 'a', label: '甲' }, { optionKey: 'b', label: '乙' }, { optionKey: 'c', label: '丙' }]
const rows = [{ rowKey: 'first', label: '第一行' }, { rowKey: 'second', label: '第二行' }]
const configs = {
  LIKERT: { options }, MATRIX: { options, rows }, MATRIX_MULTIPLE: { options, rows, minSelections: 2, maxSelections: 2 },
  RANK_ORDER: { options }, SLIDER: { min: -2, max: 2, step: 0.5 }, CONSTANT_SUM: { options, total: 100 },
}
const input = (type: keyof typeof configs, patch = {}, required = true) => ({ type: 'FORM', formType: type.toLowerCase(), formLabel: '合成结构化题', required,
  formDefinition: { type, prompt: '合成结构化题', required, options: [], rows: [], ...configs[type], ...patch } })
const field = (type: keyof typeof configs, patch = {}, required = true) => {
  const parsed = addCompositeItemSchema.parse(input(type, patch, required))
  return { id: 'id', formType: parsed.formType!, formLabel: parsed.formLabel!, required, position: 0, formSectionPosition: null,
    placeholder: null, formOptions: null, contextKey: null, formDefinition: { ...parsed.formDefinition!, itemKey: 'q_id' } }
}
const accepted = { LIKERT: 'a', MATRIX: { first: 'b', second: 'a' }, MATRIX_MULTIPLE: { first: ['a', 'c'], second: ['b', 'a'] },
  RANK_ORDER: ['c', 'a', 'b'], SLIDER: 0, CONSTANT_SUM: { a: 0, b: 25, c: 75 } }
describe('C05 Training adapter consumes shared structured Form contracts', () => {
  it.each(Object.keys(configs) as Array<keyof typeof configs>)('authors and preserves %s without coercion', type => {
    const q = field(type)
    expect(normalizeTypedCompositeFormAnswer(q, accepted[type])).toEqual(accepted[type])
    expect(addCompositeItemSchema.safeParse(input(type, { itemKey: 'client-key' })).success).toBe(false)
    expect(normalizeTypedCompositeFormAnswer(field(type, {}, false), null)).toBeNull()
    expect(() => normalizeTypedCompositeFormAnswer(q, null)).toThrow()
    for (const patch of [{ allowRefusal: true }, { image: {} }, { displayIf: { itemKey: 'x', operator: 'EQUALS', optionKey: 'a' } }, { otherOptionKey: 'a' }, { exclusiveOptionKeys: ['a'] }]) {
      expect(addCompositeItemSchema.safeParse(input(type, patch)).success).toBe(false)
    }
  })
  it.each(['MATRIX', 'MATRIX_MULTIPLE'] as const)('rejects unknown, nested, aggregate or missing row keys for %s', type => {
    const q = field(type)
    for (const value of [{}, { first: null }, { ...accepted[type], unknown: 'a' }, { ...accepted[type], 'first:other': 'a' }, [], 'a', { q_id: accepted[type] }]) {
      expect(() => normalizeTypedCompositeFormAnswer(q, value)).toThrow()
    }
    expect(addCompositeItemSchema.safeParse(input(type, { rows: [] })).success).toBe(false)
    expect(addCompositeItemSchema.safeParse(input(type, { rows: [rows[0], rows[0]] })).success).toBe(false)
  })
  it('enforces each multiple matrix row selection bounds without dropping unknown rows', () => {
    for (const first of [[], ['a'], ['a', 'b', 'c'], ['a', 'a'], ['a', 'unknown'], 'a']) {
      expect(() => normalizeTypedCompositeFormAnswer(field('MATRIX_MULTIPLE'), { first, second: ['a', 'b'] })).toThrow()
    }
    expect(normalizeTypedCompositeFormAnswer(field('MATRIX_MULTIPLE', {}, false), { first: [], second: ['a', 'b'] })).toEqual({ first: [], second: ['a', 'b'] })
    for (const patch of [{ minSelections: 3, maxSelections: 2 }, { maxSelections: 4 }]) expect(addCompositeItemSchema.safeParse(input('MATRIX_MULTIPLE', patch)).success).toBe(false)
  })
  it('requires a complete unique rank and finite in-range step-aligned slider values', () => {
    for (const value of [[], ['a'], ['a', 'a', 'b'], ['a', 'b', 'unknown'], 'a,b,c']) expect(() => normalizeTypedCompositeFormAnswer(field('RANK_ORDER'), value)).toThrow()
    for (const value of [-2.5, 2.5, 0.25, '0', NaN, Infinity]) expect(() => normalizeTypedCompositeFormAnswer(field('SLIDER'), value)).toThrow()
    for (const value of [-2, 0, 2]) expect(normalizeTypedCompositeFormAnswer(field('SLIDER'), value)).toBe(value)
  })
  it('distinguishes zero from missing and rejects negative or wrong constant sums', () => {
    const q = field('CONSTANT_SUM')
    for (const value of [{ a: 0, b: 100 }, { a: -1, b: 26, c: 75 }, { a: 0, b: 25, c: 74 }, { a: '0', b: 25, c: 75 }, { a: 0, b: 25, c: 75, unknown: 0 }]) expect(() => normalizeTypedCompositeFormAnswer(q, value)).toThrow()
    expect(normalizeTypedCompositeFormAnswer(field('CONSTANT_SUM', { total: 0 }), { a: 0, b: 0, c: 0 })).toEqual({ a: 0, b: 0, c: 0 })
    expect(() => normalizeTypedCompositeFormAnswer(field('CONSTANT_SUM', { integerOnly: true }), { a: 0.5, b: 24.5, c: 75 })).toThrow()
  })
  it('consumes the original immutable all-types golden values through Training row adaptation', () => {
    const index = cases.findIndex(c => c.name === 'v2-all-13-types')
    const fixture = cases[index] as any, expected = golden.cases[index].output as any
    // Original MATRIX contains a refused row, intentionally outside C05. The
    // other five values stay byte-identical; only disable the unopened capability.
    const questions = fixture.definition.pages.flatMap((p: any) => p.questions).filter((q: any) => q.type in configs && q.type !== 'MATRIX')
    expect(questions).toHaveLength(5)
    for (const question of questions) {
      const { allowRefusal: _unsupported, ...q } = question
      const item = { id: 'db-' + q.itemKey, formType: q.type.toLowerCase(), formLabel: q.prompt, required: q.required, position: 0, formSectionPosition: null, placeholder: null, formOptions: null, contextKey: null, formDefinition: q }
      const value = q.type.startsWith('MATRIX') ? Object.fromEntries(q.rows.map((r: any) => [r.rowKey, fixture.answers[q.itemKey + ':' + r.rowKey]])) : fixture.answers[q.itemKey]
      expect(normalizeTypedCompositeFormAnswer(item, value)).toEqual(expected.rawAnswers[q.itemKey])
    }
  })
})
