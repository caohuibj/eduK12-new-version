import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Opt-in. CI skips unless AVAILABLE_MARKER_PARITY_DATABASE_URL points at a loopback database.
const url = process.env.AVAILABLE_MARKER_PARITY_DATABASE_URL?.trim()
const suite = url ? describe : describe.skip
const prefix = 'marker-parity-' + randomUUID()
const teacher = prefix + '-teacher'
const student = prefix + '-student'
const sqlNullId = prefix + '-sql'
const jsonNullId = prefix + '-json'
const flowId = prefix + '-flow'
const variantId = prefix + '-variant'
const ids = [sqlNullId, jsonNullId, flowId, variantId]

suite('summary marker JSON null matches Prisma JS null', () => {
  let db: typeof import('../../config/database')['prisma']
  let listAvailableForStudent: typeof import('../../modules/composite/composite.service')['listAvailableForStudent']
  let courseId = ''

  beforeAll(async () => {
    const parsed = new URL(url!)
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) throw new Error('loopback fixture database required')
    process.env.DATABASE_URL = url
    process.env.NODE_ENV = 'test'
    process.env.COGNITIVE_MODULE_ENABLED = 'true'
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    ;({ prisma: db } = await import('../../config/database'))
    ;({ listAvailableForStudent } = await import('../../modules/composite/composite.service'))
    await db.user.createMany({ data: [
      { id: teacher, username: teacher, passwordHash: 'fixture-without-login-credentials', role: 'TEACHER' },
      { id: student, username: student, passwordHash: 'fixture-without-login-credentials', role: 'STUDENT' },
    ] })
    const course = await db.course.create({ data: {
      creatorId: teacher, title: 'Marker parity', courseCode: 'MP' + randomUUID().slice(0, 8),
      status: 'PUBLISHED', courseType: 'TRAINING_COURSE', isLibrary: false,
      students: { create: [{ studentId: student, status: 'ACTIVE' }] },
    } })
    courseId = course.id
    const base = (id: string, name: string) => ({
      id, code: id, name, createdBy: teacher, productKind: 'LEGACY_COMPOSITE', courseId,
      status: 'DRAFT' as const, maxAttempts: 1,
      formSections: { create: [{ title: 'parity section', position: 0 }] },
    })
    await db.compositeAssessment.create({ data: base(sqlNullId, 'sql null') })
    await db.compositeAssessment.create({ data: {
      ...base(jsonNullId, 'json null'),
      trainingFlowDraft: Prisma.JsonNull, trainingFlowFrozen: Prisma.JsonNull,
      trainingVariantFrozen: Prisma.JsonNull, trainingVariantDigest: 'd'.repeat(64),
    } })
    await db.compositeAssessment.create({ data: {
      ...base(flowId, 'flow object'),
      trainingFlowFrozen: { schemaVersion: 1 }, trainingFlowDigest: 'flow',
    } })
    await db.compositeAssessment.create({ data: {
      ...base(variantId, 'variant object'),
      trainingVariantFrozen: { schemaVersion: 1 }, trainingVariantDigest: 'e'.repeat(64),
    } })
    await db.compositeAssessment.updateMany({ where: { id: { in: ids } }, data: { status: 'PUBLISHED', publishedAt: new Date('2026-06-01T00:00:00.000Z') } })
  }, 60000)

  afterAll(async () => {
    if (!db) return
    try {
      await db.compositeAssessment.deleteMany({ where: { id: { in: ids } } })
      if (courseId) {
        await db.courseStudent.deleteMany({ where: { courseId } })
        await db.course.delete({ where: { id: courseId } })
      }
      await db.user.deleteMany({ where: { id: { in: [teacher, student] } } })
    } finally { await db.$disconnect() }
  })

  it('treats JSON null as absent and an object as present, matching detail mode', async () => {
    const probe = await db.$queryRaw<Array<{ id: string; draftIsNotNull: boolean; draftPresent: boolean; variantIsNotNull: boolean; variantPresent: boolean }>>`
      SELECT id,
        ("training_flow_draft" IS NOT NULL) AS "draftIsNotNull",
        ("training_flow_draft" IS NOT NULL AND jsonb_typeof("training_flow_draft") <> 'null') AS "draftPresent",
        ("training_variant_frozen" IS NOT NULL) AS "variantIsNotNull",
        ("training_variant_frozen" IS NOT NULL AND jsonb_typeof("training_variant_frozen") <> 'null') AS "variantPresent"
      FROM "composite_assessments" WHERE id = ${jsonNullId}`
    expect(probe).toEqual([{ id: jsonNullId, draftIsNotNull: true, draftPresent: false, variantIsNotNull: true, variantPresent: false }])
    const loaded = await db.compositeAssessment.findUniqueOrThrow({
      where: { id: jsonNullId }, select: { trainingFlowDraft: true, trainingVariantFrozen: true },
    })
    expect(loaded.trainingFlowDraft).toBeNull()
    expect(loaded.trainingVariantFrozen).toBeNull()

    const detail = await listAvailableForStudent(student, Date.now(), courseId)
    const summary = await listAvailableForStudent(student, Date.now(), courseId, true)
    const cards = (rows: Array<Record<string, any>>) => rows
      .filter(row => ids.includes(row.id))
      .map(({ instruction, items, units, formSections, ...card }) => card)
      .sort((left, right) => left.id.localeCompare(right.id))
    expect(cards(summary)).toEqual(cards(detail))
    const byId = Object.fromEntries(summary.filter(row => ids.includes(row.id)).map(row => [row.id, row]))
    expect(byId[sqlNullId]).toMatchObject({ estimatedModules: 1, weightedVariants: false })
    expect(byId[jsonNullId]).toMatchObject({ estimatedModules: 1, weightedVariants: false })
    expect(byId[flowId]).toMatchObject({ estimatedModules: null, weightedVariants: false })
    expect(byId[variantId]).toMatchObject({ estimatedModules: 1, weightedVariants: true })
  })
})
