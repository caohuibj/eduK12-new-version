import { describe, expect, it, vi } from 'vitest'
vi.mock('../../config/database', () => ({ prisma: {} }))
import { normalizeCompositeSectionAnswers, persistCompositeFormSection } from '../../modules/composite/final-submit.service'
import { createFormSectionCollectionFacts } from '../../modules/assessment-runtime/form-facts'
const section = { id: 's', title: 'Form', description: null, position: 0, contextSection: false, items: [
  { id: 'a', formType: 'text_input', formLabel: 'Required', placeholder: null, required: true, formOptions: null, contextKey: null, position: 0, formSectionPosition: 0 },
  { id: 'b', formType: 'text_input', formLabel: 'Optional', placeholder: null, required: false, formOptions: null, contextKey: null, position: 1, formSectionPosition: 1 },
] }
describe('ordinary optional Form V1 compatibility bridge', () => {
  it('preserves explicit null facts and does not reinterpret free-text refusal', () => {
    const result = normalizeCompositeSectionAnswers(section, [{ formItemId: 'a', value: '  保留答案  ' }])
    expect(result.payloadAnswers).toEqual([{ formItemId: 'a', value: '保留答案' }, { formItemId: 'b', value: null }])
    const facts = createFormSectionCollectionFacts({ sectionKey: 's', items: result.normalized.map(x => ({ key: x.item.id, label: x.item.formLabel, value: x.normalizedValue })) })
    expect(facts.schemaVersion).toBe(1)
    expect(facts.items[1].value).toBeNull()
    expect(normalizeCompositeSectionAnswers(section, [{ formItemId: 'a', value: 'x' }, { formItemId: 'b', value: '__REFUSED__' }]).payloadAnswers[1].value).toBe('__REFUSED__')
  })
  it('rejects required missing, blank strings and unknown/duplicate item ids', () => {
    for (const answers of [[], [{ formItemId: 'a', value: '' }], [{ formItemId: 'a', value: 'x' }, { formItemId: 'b', value: ' ' }], [{ formItemId: 'a', value: 'x' }, { formItemId: 'hidden', value: 'x' }], [{ formItemId: 'a', value: 'x' }, { formItemId: 'a', value: 'x' }]]) {
      expect(() => normalizeCompositeSectionAnswers(section, answers)).toThrow()
    }
  })
  it('keeps old answered SQL unchanged and never inserts null into String', async () => {
    const tx: any = { $executeRaw: vi.fn(), compositeFormAnswer: { findFirst: vi.fn().mockResolvedValue(null), deleteMany: vi.fn() } }
    await persistCompositeFormSection(tx, 'attempt', 'section-attempt', [{ itemId: 'a', value: 'x' }, { itemId: 'b', value: null }])
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(tx.$executeRaw.mock.calls[0][0].values).toContain('x')
    expect(tx.$executeRaw.mock.calls[0][0].values).not.toContain(null)
    expect(tx.compositeFormAnswer.deleteMany).toHaveBeenCalledWith({ where: { attemptId: 'attempt', itemId: { in: ['b'] }, completed: false, OR: [{ formSectionAttemptId: null }, { formSectionAttemptId: 'section-attempt' }] } })
  })
  it('does not overwrite accepted answers and handles entirely missing projections', async () => {
    const tx: any = { $executeRaw: vi.fn(), compositeFormAnswer: { findFirst: vi.fn().mockResolvedValue({ id: 'accepted' }), deleteMany: vi.fn() } }
    await expect(persistCompositeFormSection(tx, 'attempt', 'section-attempt', [{ itemId: 'b', value: null }])).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.compositeFormAnswer.deleteMany).not.toHaveBeenCalled()
    tx.compositeFormAnswer.findFirst.mockResolvedValue(null)
    await persistCompositeFormSection(tx, 'attempt', 'section-attempt', [{ itemId: 'b', value: null }])
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })
})
