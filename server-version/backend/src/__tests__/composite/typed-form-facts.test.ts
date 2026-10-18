import { describe, expect, it, vi, beforeEach } from 'vitest'
import { randomBytes } from 'node:crypto'
const mocks = vi.hoisted(() => ({ findMany: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { assessmentUnitSnapshot: { findMany: mocks.findMany } } }))
import { normalizeCompositeSectionAnswers } from '../../modules/composite/final-submit.service'
import { mapCompositeSection, compositeFormSectionDefinitionHash } from '../../modules/assessment-runtime/form-section-definition'
import { formFactsFor } from '../../modules/assessment-runtime/unified-form-section-final-submit.service'
import { readFormSectionCollectionFacts, createTypedFormSectionCollectionFacts } from '../../modules/assessment-runtime/form-facts'
import { assertTypedCompositeFormFacts, loadCompositeTypedFormValues } from '../../modules/assessment-runtime/typed-form-facts'
import { encryptUnifiedRuntimePayload, decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { finalCompositeFormSectionSubmitSchema, finalQuestionnaireFormSectionSubmitSchema } from '../../services/questionnaire-final-submit.schema'
import type { FormQuestion } from '../../modules/assessment-core/form/definition'

const question = (type: FormQuestion['type'], extra: Record<string, unknown> = {}) => ({ itemKey: 'stable', type, prompt: '题目', required: true, options: [], rows: [], ...extra })
const section = (type: FormQuestion['type'], extra: Record<string, unknown> = {}) => mapCompositeSection({ id: 'section', title: 'Form', position: 0, items: [{ id: 'db-id', formType: type.toLowerCase(), formLabel: '题目', formOptions: null, required: extra.required ?? true, formDefinition: question(type, extra), position: 0 }] })
const submit = (s: ReturnType<typeof section>, value: any) => normalizeCompositeSectionAnswers(s, [{ formItemId: 'db-id', value }])
const options = [{ optionKey: 'a', label: '甲' }, { optionKey: 'b', label: '乙' }]
const canonicalFacts = (s: ReturnType<typeof section>, value: any) => formFactsFor(s.id, submit(s, value).normalized)

beforeEach(() => { process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('hex'); mocks.findMany.mockReset() })
describe('Training typed Form facts foundation', () => {
  it.each([
    ['NUMBER', { min: 0, max: 100, precision: 4 }, 12.3456],
    ['LONG_TEXT', { maxLength: 100 }, ' 原文\n"中文" '],
    ['DATE', {}, '2026-10-18'], ['TIME', { timeZone: 'UTC' }, '13:45'],
    ['RANK_ORDER', { options }, ['b', 'a']],
    ['CONSTANT_SUM', { options, total: 100 }, { a: 20.25, b: 79.75 }],
    ['MATRIX', { options, rows: [{ rowKey: 'r1', label: '行1' }] }, { r1: 'a' }],
    ['MATRIX_MULTIPLE', { options, rows: [{ rowKey: 'r1', label: '行1' }] }, { r1: ['b', 'a'] }],
    ['SLIDER', { min: 0, max: 10, step: 0.25 }, 2.75],
    ['LIKERT', { options }, 'b'],
  ] as const)('preserves %s from definition to canonical encrypted snapshot and reader', (type, extra, value) => {
    const s = section(type, extra)
    const facts = canonicalFacts(s, value)
    expect(facts.schemaVersion).toBe(2)
    const restored = readFormSectionCollectionFacts(decryptUnifiedRuntimePayload(encryptUnifiedRuntimePayload(facts)))
    expect(restored.items[0].value).toEqual(value)
    assertTypedCompositeFormFacts(s, restored)
    expect(canonicalHash(restored)).toBe(canonicalHash(facts))
    expect(typeof submit(s, value).normalized[0].storedValue).toBe('string')
  })
  it.each([['NUMBER', {}, '12'], ['NUMBER', {}, Infinity], ['DATE', {}, '2026-02-30'], ['TIME', { timeZone: 'UTC' }, '24:00'], ['RANK_ORDER', { options }, ['a', 'a']], ['CONSTANT_SUM', { options, total: 100 }, { a: 1, b: 2 }], ['MATRIX', { options, rows: [{ rowKey: 'r1', label: '行1' }] }, { hidden: 'a' }]] as const)('rejects invalid %s without coercion', (type, extra, value) => {
    expect(() => submit(section(type, extra), value)).toThrow()
  })
  it('preserves optional null and requires required values', () => {
    expect(canonicalFacts(section('NUMBER', { required: false }), null).items[0].value).toBeNull()
    expect(canonicalFacts(section('MATRIX', { required: false, options, rows: [{ rowKey: 'r1', label: '行1' }] }), null).items[0].value).toBeNull()
    expect(() => submit(section('NUMBER'), null)).toThrow()
  })
  it('rejects unsupported C06/media, mismatched definitions and repeated stable keys', () => {
    for (const extra of [{ allowRefusal: true }, { exclusiveOptionKeys: ['a'] }, { image: {} }, { displayIf: { itemKey: 'old', operator: 'EQUALS', optionKey: 'a' } }]) expect(() => submit(section('NUMBER', extra), 1)).toThrow()
    const s = section('NUMBER'); s.items[0].formType = 'long_text'
    expect(() => submit(s, 1)).toThrow()
    const duplicate = section('NUMBER'); duplicate.items.push({ ...duplicate.items[0], id: 'second' })
    expect(() => submit(duplicate, 1)).toThrow()
  })
  it('rejects duplicate IDs, injected fields and whole payload budget violations', () => {
    const s = section('NUMBER')
    for (const answers of [[{ formItemId: 'db-id', value: 1 }, { formItemId: 'db-id', value: 2 }], [{ formItemId: 'hidden', value: 1 }], [{ formItemId: 'db-id', value: 'x'.repeat(512001) }]]) expect(() => normalizeCompositeSectionAnswers(s, answers)).toThrow()
  })
  it('preserves historical null/absent definition hashes and V1 facts bytes', () => {
    const raw = { id: 'section', title: 'Form', position: 0, items: [{ id: 'db-id', formType: 'text_input', formLabel: '题目', required: true, position: 0 }] }
    const before = mapCompositeSection(raw), after = mapCompositeSection({ ...raw, items: [{ ...raw.items[0], formDefinition: null }] })
    expect(after).toEqual(before)
    expect(compositeFormSectionDefinitionHash(after)).toBe(compositeFormSectionDefinitionHash(before))
    const facts = canonicalFacts(before, '  old  ')
    expect(facts).toEqual({ schemaVersion: 1, sectionKey: 'section', items: [{ key: 'db-id', label: '题目', value: 'old' }] })
  })
  it('binds V2 values to definition and refuses V1 downgrade and noncanonical snapshots', () => {
    const s = section('NUMBER'), facts = canonicalFacts(s, 12)
    expect(() => assertTypedCompositeFormFacts(s, { ...facts, schemaVersion: 1 } as any)).toThrow()
    expect(() => assertTypedCompositeFormFacts(s, { ...facts, items: [{ key: 'db-id', label: '题目', value: '12' }] } as any)).toThrow()
    expect(() => createTypedFormSectionCollectionFacts({ sectionKey: 's', items: [{ key: 'a', label: 'A', value: NaN }] })).toThrow()
  })
  it('reads typed values from snapshots, with no String fallback', async () => {
    const s = section('NUMBER'), facts = canonicalFacts(s, 12.3456)
    const parent = { id: 'attempt', attemptEpoch: 1, runtimeGeneration: 'UNIFIED_V1', compositeAssessment: { id: 'parent', items: [{ type: 'FORM', formDefinition: question('NUMBER') }], formSections: [{ ...s, items: s.items.map(item => ({ ...item, formPlaceholder: item.placeholder })) }] } }
    const { formSectionSlotKey } = await import('../../modules/assessment-runtime/slot-set')
    mocks.findMany.mockResolvedValue([{ slotKey: formSectionSlotKey(s.id), terminalState: 'COMPLETED', payloadKind: 'COLLECTION_FACTS', unitType: 'FORM_SECTION', sourceType: 'COMPOSITE_FORM_SECTION', sourceDefinitionHash: canonicalHash(s), collectionFactsEncrypted: encryptUnifiedRuntimePayload(facts) }])
    expect((await loadCompositeTypedFormValues(parent)).get('db-id')).toBe(12.3456)
    mocks.findMany.mockResolvedValue([])
    await expect(loadCompositeTypedFormValues(parent)).rejects.toThrow()
  })
  it('expands only the composite wire contract', () => {
    const payload = { submissionId: 'typed-submission-id', attemptEpoch: 1, definitionHash: 'hash', answers: [{ formItemId: 'db-id', value: { a: 20, b: 80 } }] }
    expect(finalCompositeFormSectionSubmitSchema.safeParse(payload).success).toBe(true)
    expect(finalQuestionnaireFormSectionSubmitSchema.safeParse(payload).success).toBe(false)
    const legacy = { ...payload, answers: Array.from({ length: 501 }, (_, i) => ({ formItemId: 'old_' + i, value: null })) }
    expect(finalCompositeFormSectionSubmitSchema.safeParse(legacy).success).toBe(true)
    const legacySection = mapCompositeSection({ id: 's', title: 'old', position: 0, items: legacy.answers.map((answer, i) => ({ id: answer.formItemId, formType: 'text_input', formLabel: 'Old', required: false, formOptions: null, position: i })) })
    expect(normalizeCompositeSectionAnswers(legacySection, legacy.answers).payloadAnswers).toHaveLength(501)
  })
})
