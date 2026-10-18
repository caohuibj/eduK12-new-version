import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'

const url = integrationDatabaseUrl('QUESTIONNAIRE_PRODUCT_TEST_DATABASE_URL', 'LEGACY_AUTHORING_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
const suffix = randomUUID()
const actor = { userId: 'form-copy-owner-' + suffix, role: UserRole.TEACHER }
const other = { userId: 'form-copy-other-' + suffix, role: UserRole.TEACHER }
let db: PrismaClient
let product: typeof import('../../modules/questionnaire-product/service')
let normalize: typeof import('../../modules/composite/final-submit.service')['normalizeCompositeSectionAnswers']
let courseId: string

async function source() {
  return db.questionnaire.create({ data: {
    code: randomUUID(), name: 'Published legacy Form', type: 'COURSE', status: 'PUBLISHED', creatorId: actor.userId,
    courseQuestionnaires: { create: { courseId } },
  } })
}

async function sourceDefinition(id: string) {
  return db.questionnaire.findUniqueOrThrow({ where: { id }, include: {
    formItems: { orderBy: { position: 'asc' } }, formSections: { orderBy: { position: 'asc' } }, courseQuestionnaires: true,
  } })
}

suite('Legacy Form definition copy compatibility', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url!
    db = new PrismaClient({ datasources: { db: { url } } })
    await db.$connect()
    product = await import('../../modules/questionnaire-product/service')
    normalize = (await import('../../modules/composite/final-submit.service')).normalizeCompositeSectionAnswers
    for (const user of [actor, other]) await db.user.create({ data: { id: user.userId, username: user.userId, passwordHash: 'fixture-only', role: user.role } })
    courseId = (await db.course.create({ data: { title: 'Form copy course', courseCode: 'FC-' + suffix, creatorId: actor.userId, status: 'PUBLISHED' } })).id
  }, 60000)
  afterAll(async () => {
    if (!db) return
    const owners = [actor.userId, other.userId]
    await db.compositeAssessment.deleteMany({ where: { createdBy: { in: owners } } })
    await db.questionnaire.deleteMany({ where: { creatorId: { in: owners } } })
    await db.scale.deleteMany({ where: { creatorId: { in: owners } } })
    await db.course.deleteMany({ where: { creatorId: { in: owners } } })
    await db.user.deleteMany({ where: { id: { in: owners } } })
    await db.$disconnect()
  }, 60000)

  it('preserves optional flags, section order and complete option media JSON without changing the published source', async () => {
    const original = await source()
    const background = await db.questionnaireFormSection.create({ data: { questionnaireId: original.id, title: '背景', description: 'Background description', position: 0, contextSection: true } })
    const choices = await db.questionnaireFormSection.create({ data: { questionnaireId: original.id, title: '可选问题', description: 'Optional description', position: 7 } })
    const options = [{ value: 'one', label: 'One',
      images: [{ asset: { assetId: 'image-identity', contentHash: 'a'.repeat(64), mimeType: 'image/png' }, altText: 'Original alt', caption: 'Original credit', order: 0 }],
      video: { schemaVersion: 1, video: { assetId: 'video-identity', contentHash: 'b'.repeat(64), mimeType: 'video/mp4' }, title: 'Original caption' },
    }]
    await db.questionnaireFormItem.createMany({ data: [
      { questionnaireId: original.id, type: 'year_month', label: '出生年月', required: true, position: 0, sectionId: background.id, sectionPosition: 0, contextKey: 'birthYearMonth' },
      { questionnaireId: original.id, type: 'text_input', label: '说明', placeholder: 'May skip', required: false, position: 2, sectionId: choices.id, sectionPosition: 1 },
      { questionnaireId: original.id, type: 'single_choice', label: '可选媒体', required: false, position: 3, sectionId: choices.id, sectionPosition: 0, options },
    ] })
    const before = await sourceDefinition(original.id)
    const copied = await product.copy(actor, original.id, { requestId: randomUUID() })
    expect(copied).toMatchObject({ status: 'DRAFT', productKind: 'QUESTIONNAIRE', publicEnabled: false })
    const sections = await db.compositeFormSection.findMany({ where: { compositeAssessmentId: copied.id }, orderBy: { position: 'asc' }, include: { items: { orderBy: { formSectionPosition: 'asc' } } } })
    expect(sections.map(section => ({ title: section.title, description: section.description, position: section.position, contextSection: section.contextSection }))).toEqual(before.formSections.map(section => ({ title: section.title, description: section.description, position: section.position, contextSection: section.contextSection })))
    expect(sections.every(section => !before.formSections.some(old => old.id === section.id))).toBe(true)
    expect(sections[1].items.map(item => [item.formLabel, item.required, item.position, item.formSectionPosition])).toEqual([['可选媒体', false, 3, 0], ['说明', false, 2, 1]])
    expect(sections[1].items[0].formOptions).toEqual(options)
    expect(sections[1].items[1].formPlaceholder).toBe('May skip')
    expect(sections[0].items[0]).toMatchObject({ required: true, contextKey: 'birthYearMonth', formType: 'year_month' })
    expect(await sourceDefinition(original.id)).toEqual(before)
    expect(await db.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: copied.id } })).toBe(0)
    expect(await db.compositeAssessmentAccessToken.count({ where: { compositeAssessmentId: copied.id } })).toBe(0)
  })

  it('copies once under concurrent retries and publishes preserved required and optional FINAL semantics', async () => {
    const original = await source()
    await db.questionnaireFormItem.createMany({ data: [
      { questionnaireId: original.id, type: 'text_input', label: 'Required', required: true, position: 0 },
      { questionnaireId: original.id, type: 'text_input', label: 'Optional', required: false, position: 1 },
    ] })
    const before = await sourceDefinition(original.id)
    const request = { requestId: randomUUID() }
    const [first, second] = await Promise.all([product.copy(actor, original.id, request), product.copy(actor, original.id, request)])
    expect(first.id).toBe(second.id)
    expect(await db.compositeAssessment.count({ where: { creationKey: actor.userId + ':' + request.requestId } })).toBe(1)
    expect(await product.preflight(actor, first.id, { revision: first.revision })).toMatchObject({ ok: true })
    const published = await product.publish(actor, first.id, { revision: first.revision })
    expect(published.status).toBe('PUBLISHED')
    const section = published.formSections[0]
    const required = section.items.find((item: any) => item.required)!
    const optional = section.items.find((item: any) => !item.required)!
    expect(() => normalize(section, [{ formItemId: optional.id, value: 'answer' }])).toThrow(/必填/)
    expect(normalize(section, [{ formItemId: required.id, value: 'answer' }]).payloadAnswers).toContainEqual({ formItemId: optional.id, value: null })
    await expect(product.update(actor, published.id, { revision: published.revision, name: 'Changed', courseIds: [courseId] })).rejects.toMatchObject({ statusCode: 409 })
    expect(await sourceDefinition(original.id)).toEqual(before)
  })

  it.each([
    { type: 'ranking', options: null, error: '题型不受支持' },
    { type: 'single_choice', options: [{ value: 'same', label: 'A' }, { value: 'same', label: 'B' }], error: '选项不能重复' },
  ])('keeps unsupported legacy $type data visible in a draft but blocks preflight and publication', async ({ type, options, error }) => {
    const original = await source()
    const data = { questionnaireId: original.id, type, label: 'Needs repair', required: false, position: 0 }
    await db.questionnaireFormItem.create({ data: options ? { ...data, options } : data })
    const copied = await product.copy(actor, original.id, { requestId: randomUUID() })
    const before = await db.compositeAssessment.findUniqueOrThrow({ where: { id: copied.id } })
    const result = await product.preflight(actor, copied.id, { revision: copied.revision })
    expect(result.ok).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({ status: 'failed', message: expect.stringContaining(error), targetId: copied.formSections[0].id }))
    await expect(product.publish(actor, copied.id, { revision: copied.revision })).rejects.toMatchObject({ statusCode: 400 })
    expect(await db.compositeAssessment.findUniqueOrThrow({ where: { id: copied.id } })).toEqual(before)
    expect((await sourceDefinition(original.id)).formItems[0]).toMatchObject({ type, required: false })
  })

  it('rejects another teacher before creating a copy or disclosing preflight detail', async () => {
    const original = await source()
    await db.questionnaireFormItem.create({ data: { questionnaireId: original.id, type: 'text_input', label: 'Optional', required: false } })
    const request = { requestId: randomUUID() }
    await expect(product.copy(other, original.id, request)).rejects.toMatchObject({ statusCode: 403 })
    expect(await db.compositeAssessment.findUnique({ where: { creationKey: other.userId + ':' + request.requestId } })).toBeNull()
    const copied = await product.copy(actor, original.id, { requestId: randomUUID() })
    await expect(product.preflight(other, copied.id, { revision: copied.revision })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('does not treat copying a legacy definition as a grant to publish a foreign private scale', async () => {
    const original = await source()
    const scale = await db.scale.create({ data: { code: randomUUID(), name: 'Private scale', creatorId: other.userId, status: 'PUBLISHED', visibility: 'HIDDEN' } })
    await db.questionnaireScale.create({ data: { questionnaireId: original.id, scaleId: scale.id, position: 0 } })
    await db.questionnaireFormItem.create({ data: { questionnaireId: original.id, type: 'text_input', label: 'Optional', required: false, position: 1 } })
    const copied = await product.copy(actor, original.id, { requestId: randomUUID() })
    const result = await product.preflight(actor, copied.id, { revision: copied.revision })
    expect(result.ok).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({ status: 'failed', message: '无权限使用此量表' }))
    await expect(product.publish(actor, copied.id, { revision: copied.revision })).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.compositeAssessment.findUniqueOrThrow({ where: { id: copied.id } })).status).toBe('DRAFT')
  })
})
