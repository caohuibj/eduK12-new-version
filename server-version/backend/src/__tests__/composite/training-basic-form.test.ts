import { describe, expect, it } from 'vitest'
import { addCompositeItemSchema } from '../../modules/composite/composite.schema'
import { normalizeTypedCompositeFormAnswer } from '../../modules/assessment-runtime/typed-form'

const input = (type: string, constraints = {}, required = true) => ({ type: 'FORM', formType: type.toLowerCase(), formLabel: '合成题', required,
  formDefinition: { type, prompt: '合成题', required, options: [], rows: [], ...constraints } })
const field = (type: string, constraints = {}, required = true) => {
  const parsed = addCompositeItemSchema.parse(input(type, constraints, required))
  return { id: 'id', formType: parsed.formType!, formLabel: parsed.formLabel!, required, position: 0, formSectionPosition: null,
    placeholder: null, formOptions: null, contextKey: null, formDefinition: { ...parsed.formDefinition!, itemKey: 'q_id' } }
}
describe('C04 public basic typed authoring and shared answers', () => {
  it.each(['NUMBER', 'LONG_TEXT', 'DATE', 'TIME'])('accepts %s with a server-owned stable key', type => {
    expect(addCompositeItemSchema.parse(input(type, type === 'TIME' ? { timeZone: 'UTC' } : {})).formDefinition?.type).toBe(type)
    expect(addCompositeItemSchema.safeParse(input(type, { itemKey: 'q_injected' })).success).toBe(false)
  })
  it('requires matching definition, type, prompt, required flag and declared timezone', () => {
    for (const raw of [
      { ...input('NUMBER'), formDefinition: undefined }, input('TIME'), input('NUMBER', { prompt: '不同' }),
      input('NUMBER', { required: false }), input('NUMBER', { type: 'LONG_TEXT' }), input('NUMBER', { timeZone: 'UTC' }),
      { ...input('NUMBER'), contextKey: 'gradeLevel' }, { ...input('NUMBER'), type: 'SCALE', scaleId: 'scale' },
    ]) expect(addCompositeItemSchema.safeParse(raw).success).toBe(false)
  })
  it('rejects unopened authoring and future policy capabilities', () => {
    for (const type of ['MATRIX', 'LIKERT', 'SLIDER', 'RANK_ORDER', 'CONSTANT_SUM']) expect(addCompositeItemSchema.safeParse(input(type)).success).toBe(false)
    for (const patch of [{ allowRefusal: true }, { displayIf: { itemKey: 'prior', operator: 'EQUALS', optionKey: 'a' } }, { otherOptionKey: 'a' }, { exclusiveOptionKeys: ['a'] }, { image: {} }]) {
      expect(addCompositeItemSchema.safeParse(input('NUMBER', patch)).success).toBe(false)
    }
  })
  it('enforces numeric constraints at authoring and preserves numeric zero and empty optional separately', () => {
    for (const patch of [{ min: 2, max: 1 }, { precision: 9 }, { step: 0 }, { integerOnly: true, precision: 2 }, { integerOnly: true, min: 0.5 }]) {
      expect(addCompositeItemSchema.safeParse(input('NUMBER', patch)).success).toBe(false)
    }
    const q = field('NUMBER', { min: 0, max: 2, precision: 2, step: 0.25 })
    expect(normalizeTypedCompositeFormAnswer(q, 0)).toBe(0)
    expect(normalizeTypedCompositeFormAnswer(q, 1.25)).toBe(1.25)
    for (const value of ['0', null, -1, 3, 0.333, NaN, Infinity]) expect(() => normalizeTypedCompositeFormAnswer(q, value)).toThrow()
    const optional = field('NUMBER', {}, false)
    expect(normalizeTypedCompositeFormAnswer(optional, null)).toBeNull()
    expect(normalizeTypedCompositeFormAnswer(optional, '')).toBeNull()
    expect(normalizeTypedCompositeFormAnswer(optional, 0)).toBe(0)
    expect(() => normalizeTypedCompositeFormAnswer(field('NUMBER', { integerOnly: true }), 1.5)).toThrow()
  })
  it('validates calendar dates, minute precision and long text without coercion', () => {
    const date = field('DATE'), time = field('TIME', { timeZone: 'Asia/Shanghai' }), text = field('LONG_TEXT', { maxLength: 5 })
    expect(normalizeTypedCompositeFormAnswer(date, '2024-02-29')).toBe('2024-02-29')
    for (const value of ['2023-02-29', '2024-04-31', '0000-01-01', '2024-2-1', 20240101]) expect(() => normalizeTypedCompositeFormAnswer(date, value)).toThrow()
    expect(normalizeTypedCompositeFormAnswer(time, '00:00')).toBe('00:00')
    expect(normalizeTypedCompositeFormAnswer(time, '23:59')).toBe('23:59')
    for (const value of ['24:00', '12:60', '1:01', '12:00:00']) expect(() => normalizeTypedCompositeFormAnswer(time, value)).toThrow()
    expect(normalizeTypedCompositeFormAnswer(text, '中文\n原文')).toBe('中文\n原文')
    expect(() => normalizeTypedCompositeFormAnswer(text, '123456')).toThrow()
    expect(normalizeTypedCompositeFormAnswer(field('LONG_TEXT', {}, false), '')).toBeNull()
  })
  it('keeps legacy authoring byte-shaped and does not manufacture typed definitions', () => {
    const raw = { type: 'FORM', formType: 'text_input', formLabel: '旧题', required: false }
    expect(addCompositeItemSchema.parse(raw)).toEqual(raw)
    expect(addCompositeItemSchema.safeParse({ ...raw, formDefinition: input('LONG_TEXT').formDefinition }).success).toBe(false)
  })
})
