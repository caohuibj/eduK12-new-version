import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'

import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

const suite = process.env.FORM_TEMPLATE_INTEGRATION === '1' ? describe : describe.skip
let db: typeof import('../../config/database')['prisma']
let service: typeof import('../../modules/questionnaire-product/service')
const actor = { userId: randomUUID(), role: UserRole.TEACHER }
const other = { userId: randomUUID(), role: UserRole.TEACHER }
const owners = [actor.userId, other.userId]
const policy = { version: 3, requiredRefusal: 'BLOCK_SUBMIT', hiddenRequired: 'EXEMPT' }
const create = (name = '合成常用表单') => service.createFormTemplate(actor, { name, requestId: randomUUID() })
const target = () => service.create(actor, { name: '合成组合问卷', questionnaireType: 'COURSE', requestId: randomUUID() })

suite('Independent reusable form definitions on local PostgreSQL', () => {
  beforeAll(async () => {
    if (process.env.RELEASE_INTEGRATION_DATABASE_URL || process.env.CI === 'true' || process.env.RELEASE_VERIFY_LOCAL === 'true') {
      requireIsolatedReleaseDatabase(integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')!)
    } else {
      const url = new URL(process.env.DATABASE_URL!)
      if (url.hostname !== '127.0.0.1' || url.port !== '5549' || url.pathname !== '/eduk12_mac_work_20261021') throw new Error('Explicit local synthetic fixture database required')
    }
    db = (await import('../../config/database')).prisma
    service = await import('../../modules/questionnaire-product/service')
    for (const person of [actor, other]) await db.user.create({ data: { id: person.userId, username: 'form-template-fixture-' + person.userId, passwordHash: 'synthetic-only', role: 'TEACHER', accountDomain: 'TRAINING', teacherApproved: true } })
  }, 30000)
  afterAll(async () => {
    if (!db) return
    await db.materialGrant.deleteMany({ where: { teacherId: { in: owners } } })
    await db.compositeAssessment.deleteMany({ where: { createdBy: { in: owners } } })
    await db.questionnaire.deleteMany({ where: { creatorId: { in: owners } } })
    await db.user.deleteMany({ where: { id: { in: owners } } })
    await db.$disconnect()
  })
  it('persists empty templates, edits metadata, rejects delivery and non-form content', async () => {
    const form = await create()
    expect(form).toMatchObject({ productKind: 'FORM_TEMPLATE', questionnaireType: 'GENERAL', status: 'DRAFT', publicEnabled: false, items: [], questionnaireCourses: [] })
    const edited = await service.update(actor, form.id, { name: '课前需求', revision: 0 })
    expect(edited.name).toBe('课前需求')
    await expect(service.update(actor, form.id, { name: '不可投放', revision: 1, publicEnabled: true, expiresAt: new Date(Date.now() + 60000).toISOString() })).rejects.toThrow(/不设置投放/)
    await expect(service.addItem(actor, form.id, { revision: 1, item: { type: 'SCALE', scaleId: 'foreign', required: true } })).rejects.toThrow(/只能加入表单/)
    const composite = await import('../../modules/composite/composite.service')
    await expect(composite.publishComposite(actor.userId, actor.role, form.id)).rejects.toThrow(/不直接投放/)
    expect((await service.list(actor)).list.some((row: any) => row.id === form.id)).toBe(false)
  })
  it('copies the whole typed form atomically, remaps conditional keys and keeps source/delivery data independent', async () => {
    let form = await create()
    form = await service.update(actor, form.id, { name: form.name, instruction: '请按实际情况填写。', revision: form.revision })
    form = await service.addItem(actor, form.id, { revision: form.revision, item: { type: 'FORM', formType: 'single_choice', formLabel: '是否参加', required: true, formOptions: [{ value: 'yes', label: '是' }, { value: 'no', label: '否' }], formPolicy: policy, formDefinition: { type: 'SINGLE', prompt: '是否参加', required: true, options: [{ optionKey: 'yes', label: '是' }, { optionKey: 'no', label: '否' }], rows: [] } } })
    const first = { ...form.formSections[0].items[0], formSectionId: form.formSections[0].id }
    form = await service.addItem(actor, form.id, { revision: form.revision, formSectionId: first.formSectionId, item: { type: 'FORM', formType: 'long_text', formLabel: '说明', required: false, formPolicy: policy, formDefinition: { type: 'LONG_TEXT', prompt: '说明', required: false, options: [], rows: [], displayIf: { itemKey: first.formDefinition.itemKey, operator: 'EQUALS', optionKey: 'yes' } } } })
    const before = await db.compositeAssessment.findUnique({ where: { id: form.id }, include: { items: true, formSections: true } })
    const questionnaire = await target()
    const source = { id: form.id, kind: 'COMPOSITE' as const, revision: form.revision }
    const imported = await service.importFormTemplate(actor, questionnaire.id, { revision: questionnaire.revision, source })
    expect(imported.items).toHaveLength(2)
    const copiedFirst = imported.formSections[0].items.find((item: any) => item.formLabel === '是否参加')
    const copiedSecond = imported.formSections[0].items.find((item: any) => item.formLabel === '说明')
    expect(copiedFirst.id).not.toBe(first.id)
    expect(copiedSecond.formDefinition.displayIf.itemKey).toBe(copiedFirst.formDefinition.itemKey)
    expect(copiedSecond.formDefinition.displayIf.itemKey).not.toBe(first.formDefinition.itemKey)
    expect(copiedSecond.required).toBe(false)
    expect(imported.formSections).toHaveLength(1)
    expect(imported.formSections[0].description).toContain('请按实际情况填写。')
    expect(imported).toMatchObject({ publicEnabled: false, opensAt: null, expiresAt: null })
    expect(await db.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: questionnaire.id } })).toBe(0)
    expect(await db.compositeAssessmentAccessToken.count({ where: { compositeAssessmentId: questionnaire.id } })).toBe(0)
    expect(await db.compositeAssessment.findUnique({ where: { id: form.id }, include: { items: true, formSections: true } })).toEqual(before)
    await expect(service.importFormTemplate(actor, questionnaire.id, { revision: 0, source })).rejects.toThrow(/已被其他操作修改/)
    expect(await db.compositeAssessmentItem.count({ where: { compositeAssessmentId: questionnaire.id } })).toBe(2)
    const changed = await service.updateFormItem(actor, form.id, first.id, { revision: form.revision, item: { type: 'FORM', formType: 'single_choice', formLabel: '修改后的题干', required: true, formOptions: [{ value: 'yes', label: '是' }, { value: 'no', label: '否' }], formPolicy: policy, formDefinition: { type: 'SINGLE', prompt: '修改后的题干', required: true, options: first.formDefinition.options, rows: [] } } })
    expect(changed.items.find((item: any) => item.id === first.id).form.formDefinition.itemKey).toBe(first.formDefinition.itemKey)
    expect((await service.detail(actor, questionnaire.id)).items.find((item: any) => item.id === copiedFirst.id).form.label).toBe('是否参加')
    await expect(service.importFormTemplate(actor, questionnaire.id, { revision: imported.revision, source })).rejects.toThrow(/来源表单已更新/)
  })
  it('rechecks source ownership and rejects a mixed questionnaire without partial writes', async () => {
    const privateForm = await service.createFormTemplate(other, { name: '他人的表单', requestId: randomUUID() })
    const questionnaire = await target()
    await expect(service.importFormTemplate(actor, questionnaire.id, { revision: 0, source: { id: privateForm.id, kind: 'COMPOSITE', revision: 0 } })).rejects.toThrow(/本人编制/)
    const mixed = await target()
    await db.compositeAssessmentItem.create({ data: { compositeAssessmentId: mixed.id, type: 'SCALE', position: 0, required: true } })
    await expect(service.importFormTemplate(actor, questionnaire.id, { revision: 0, source: { id: mixed.id, kind: 'COMPOSITE', revision: 0 } })).rejects.toThrow(/纯表单内容/)
    expect(await db.compositeAssessmentItem.count({ where: { compositeAssessmentId: questionnaire.id } })).toBe(0)
    expect((await service.detail(actor, questionnaire.id)).revision).toBe(0)
  })
  it('uses exact legacy form grants, revocation, and no scale or attachment authority expansion', async () => {
    const legacy = await db.questionnaire.create({ data: { code: randomUUID(), name: '授权表单', type: 'GENERAL', status: 'PUBLISHED', creatorId: other.userId, formItems: { create: { type: 'text_input', label: '反馈', required: true, position: 0 } } } })
    const questionnaire = await target()
    const source = { id: legacy.id, kind: 'LEGACY' as const }
    await expect(service.importFormTemplate(actor, questionnaire.id, { revision: 0, source })).rejects.toThrow(/没有此表单/)
    const grant = await db.materialGrant.create({ data: { teacherId: actor.userId, resourceType: 'FORM_TEMPLATE', resourceId: legacy.id, grantedBy: other.userId } })
    expect((await service.formTemplateSources(actor)).list.some(row => row.id === legacy.id)).toBe(true)
    expect((await service.importFormTemplate(actor, questionnaire.id, { revision: 0, source })).items).toHaveLength(1)
    await db.questionnaireFormItem.updateMany({ where: { questionnaireId: legacy.id }, data: { options: [{ value: 'one', label: '含私有附件', images: [{ asset: { assetId: randomUUID() } }] }] } })
    await expect(service.importFormTemplate(actor, questionnaire.id, { revision: 1, source })).rejects.toThrow(/尚未单独授权的媒体/)
    await db.materialGrant.delete({ where: { id: grant.id } })
    await expect(service.importFormTemplate(actor, questionnaire.id, { revision: 1, source })).rejects.toThrow(/没有此表单/)
    expect((await service.detail(actor, questionnaire.id)).revision).toBe(1)
  })
  it('serializes new legacy form use with exact grant revocation without partial writes', async () => {
    const legacy = await db.questionnaire.create({ data: { code: randomUUID(), name: '并发表单', type: 'GENERAL', status: 'PUBLISHED', creatorId: other.userId, formItems: { create: { type: 'text_input', label: '合成反馈', required: true, position: 0 } } } })
    const questionnaire = await target()
    const source = { id: legacy.id, kind: 'LEGACY' as const }
    const grant = await db.materialGrant.create({ data: { teacherId: actor.userId, resourceType: 'FORM_TEMPLATE', resourceId: legacy.id, grantedBy: other.userId } })
    const peer = new PrismaClient()
    let release!: () => void
    const barrier = new Promise<void>(resolve => { release = resolve })
    let locked!: (pid: number) => void
    const lockReady = new Promise<number>(resolve => { locked = resolve })
    const transaction = db.$transaction.bind(db)
    const spy = vi.spyOn(db, '$transaction').mockImplementationOnce(((callback: any, options: any) => transaction(async tx => {
      const wrapped = new Proxy(tx, { get(target, key) {
        if (key !== '$queryRaw') return Reflect.get(target, key)
        return async (...args: any[]) => {
          const result = await (target.$queryRaw as any)(...args)
          const sql = Array.isArray(args[0]) ? args[0].join('') : args[0]?.sql ?? ''
          if (sql.includes('FROM material_grants') && sql.includes('FOR SHARE')) {
            const [session] = await target.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
            locked(session.pid)
            await barrier
          }
          return result
        }
      } })
      return callback(wrapped)
    }, options)) as any)
    const copying = service.importFormTemplate(actor, questionnaire.id, { revision: 0, source })
    // Observe failures immediately so an early rejection cannot leave an unhandled promise.
    const copied = copying.then(value => ({ value }), error => ({ error }))
    let revoking: Promise<unknown> | undefined
    try {
      const copyPid = await Promise.race([lockReady, copied.then(() => { throw new Error('Copy ended before the grant lock barrier') })])
      let started!: (pid: number) => void
      const writerReady = new Promise<number>(resolve => { started = resolve })
      revoking = peer.$transaction(async tx => {
        const [session] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
        started(session.pid)
        await tx.materialGrant.delete({ where: { id: grant.id } })
      }, { timeout: 15000 })
      const revoked = revoking.then(() => 'committed', () => 'failed')
      const writerPid = await Promise.race([writerReady, revoked.then(() => { throw new Error('Revocation ended before the writer barrier') })])
      const deadline = Date.now() + 5000
      let blocked = false
      while (Date.now() < deadline) {
        const [state] = await peer.$queryRaw<Array<{ blocked: boolean }>>`SELECT ${copyPid}::int = ANY(pg_blocking_pids(${writerPid}::int)) AS blocked`
        if (state.blocked) { blocked = true; break }
        if (await Promise.race([revoked, Promise.resolve('pending')]) !== 'pending') break
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      expect(blocked).toBe(true)
      expect(await peer.compositeAssessmentItem.count({ where: { compositeAssessmentId: questionnaire.id } })).toBe(0)
      release()
      expect((await copying).items).toHaveLength(1)
      await revoking
      // Revocation committed first for every subsequent copy: no target metadata,
      // sections, items, or revision may be partially changed. Existing copy stays valid.
      const rejectedTarget = await target()
      const before = await db.compositeAssessment.findUnique({ where: { id: rejectedTarget.id }, include: { items: true, formSections: true } })
      await expect(service.importFormTemplate(actor, rejectedTarget.id, { revision: 0, source })).rejects.toThrow(/没有此表单/)
      expect(await db.compositeAssessment.findUnique({ where: { id: rejectedTarget.id }, include: { items: true, formSections: true } })).toEqual(before)
      await expect(service.createFormTemplate(actor, { name: '拒绝创建', requestId: randomUUID(), source })).rejects.toThrow(/没有此表单/)
      expect(await db.compositeAssessment.count({ where: { createdBy: actor.userId, name: '拒绝创建' } })).toBe(0)
      expect((await service.detail(actor, questionnaire.id)).items).toHaveLength(1)
    } finally {
      release()
      spy.mockRestore()
      await Promise.allSettled([copied, ...(revoking ? [revoking] : [])])
      await peer.$disconnect()
    }
  }, 30000)
  it('converts an empty legacy form into an editable independent form without changing its source', async () => {
    const empty = await db.questionnaire.create({ data: { code: randomUUID(), name: '尚未录题的常用表单', type: 'GENERAL', status: 'DRAFT', creatorId: actor.userId } })
    const copied = await service.createFormTemplate(actor, { name: empty.name, requestId: randomUUID(), source: { id: empty.id, kind: 'LEGACY' } })
    expect(copied).toMatchObject({ productKind: 'FORM_TEMPLATE', status: 'DRAFT', items: [] })
    expect(await db.questionnaire.findUnique({ where: { id: empty.id } })).toMatchObject({ name: empty.name, status: 'DRAFT' })
  })
  it('creates a reusable copy once under retries, without changing an existing questionnaire', async () => {
    let original = await target()
    original = await service.addItem(actor, original.id, { revision: 0, item: { type: 'FORM', formType: 'text_input', formLabel: '反馈', required: true } })
    const request = { name: '保存的常用反馈', requestId: randomUUID(), source: { id: original.id, kind: 'COMPOSITE' as const, revision: original.revision } }
    const first = await service.createFormTemplate(actor, request)
    const retry = await service.createFormTemplate(actor, request)
    expect(retry.id).toBe(first.id)
    expect(first).toMatchObject({ productKind: 'FORM_TEMPLATE', questionnaireCourses: [], publicEnabled: false, opensAt: null, expiresAt: null })
    expect(first.items).toHaveLength(1)
    expect((await service.detail(actor, original.id)).productKind).toBe('QUESTIONNAIRE')
  })
})
