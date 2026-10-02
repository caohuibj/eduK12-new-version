import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { integrationDatabaseUrl } from '../integration/integration-env'

vi.mock('../../services/cacheService', () => ({ cacheService: { clearQuestionnaireCache: vi.fn(async () => {}) } }))
const url = integrationDatabaseUrl('LEGACY_AUTHORING_INTEGRATION_DATABASE_URL', 'INSTRUMENT_FINAL_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
let db: typeof import('../../config/database')['prisma']
let scoped: typeof import('../../services/legacyQuestionnaireDatabase')['legacyQuestionnaireDb']
let guard: typeof import('../../middleware/legacyQuestionnaireAuthoring')['legacyQuestionnaireAuthoring']
let general: typeof import('../../controllers/generalQuestionnaireController')['generalQuestionnaireController']
let publish: typeof import('../../controllers/generalQuestionnaireImageController')['generalQuestionnaireImageController']['publish']
const users: string[] = []
const questionnaires: string[] = []
const scales: string[] = []

function response() {
  const res: any = { statusCode: 200, body: undefined }
  res.status = (status: number) => { res.statusCode = status; return res }
  res.json = (body: unknown) => { res.body = body; return res }
  return res
}
async function fixture(type: 'GENERAL' | 'COURSE' = 'GENERAL', status: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED' = 'DRAFT') {
  const user = await db.user.create({ data: { username: 'cleanup-' + randomUUID(), passwordHash: 'test-only', role: 'TEACHER' } })
  users.push(user.id)
  const q = await db.questionnaire.create({ data: { code: randomUUID(), name: 'Original', type, status, creatorId: user.id } })
  questionnaires.push(q.id)
  const scale = await db.scale.create({ data: { code: randomUUID(), name: 'Fixture', status: 'PUBLISHED', creatorId: user.id } })
  scales.push(scale.id)
  await db.questionnaireScale.create({ data: { questionnaireId: q.id, scaleId: scale.id } })
  return { q, user, scale, req: { user: { userId: user.id, role: 'TEACHER' }, params: { id: q.id, scaleId: scale.id }, body: { name: 'Changed', scaleId: scale.id } } as any }
}
async function call(handler: ReturnType<typeof guard>, req: any) {
  const res = response()
  await handler(req, res, (cause?: unknown) => { throw cause })
  return res
}
function barrier() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

suite('legacy definition writes use one atomic parent lock', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url!
    db = (await import('../../config/database')).prisma
    scoped = (await import('../../services/legacyQuestionnaireDatabase')).legacyQuestionnaireDb
    guard = (await import('../../middleware/legacyQuestionnaireAuthoring')).legacyQuestionnaireAuthoring
    general = (await import('../../controllers/generalQuestionnaireController')).generalQuestionnaireController
    publish = (await import('../../controllers/generalQuestionnaireImageController')).generalQuestionnaireImageController.publish
  })
  afterAll(async () => {
    if (!db) return
    await db.questionnaire.deleteMany({ where: { id: { in: questionnaires } } })
    await db.scale.deleteMany({ where: { id: { in: scales } } })
    await db.user.deleteMany({ where: { id: { in: users } } })
    await db.$disconnect()
  })
  it.each(['PUBLISHED', 'DEPRECATED'] as const)('rejects all three formerly unguarded GENERAL mutations in %s', async status => {
    const { q, req } = await fixture('GENERAL', status)
    for (const handler of [general.addScale, general.removeScale, general.update]) {
      const res = await call(guard('GENERAL', handler), req)
      expect(res.statusCode).toBe(400)
    }
    expect((await db.questionnaire.findUniqueOrThrow({ where: { id: q.id } })).name).toBe('Original')
    expect(await db.questionnaireScale.count({ where: { questionnaireId: q.id } })).toBe(1)
  })
  it('allows a DRAFT update and rejects another owner before mutation', async () => {
    const { q, req } = await fixture()
    expect((await call(guard('GENERAL', general.update), req)).body.code).toBe(0)
    req.user.userId = randomUUID()
    expect((await call(guard('GENERAL', general.removeScale), req)).statusCode).toBe(403)
    expect((await db.questionnaire.findUniqueOrThrow({ where: { id: q.id } })).name).toBe('Changed')
  })
  it('publish first: blocked edit reloads PUBLISHED and cannot modify it', async () => {
    const { q, req } = await fixture()
    const entered = barrier(), release = barrier()
    const publishing = call(guard('GENERAL', async (r, res) => { entered.resolve(); await release.promise; return publish(r, res) }), req)
    await entered.promise
    const editing = call(guard('GENERAL', general.update), req)
    release.resolve()
    expect((await publishing).body.code).toBe(0)
    expect((await editing).statusCode).toBe(400)
    expect(await db.questionnaire.findUniqueOrThrow({ where: { id: q.id } })).toMatchObject({ status: 'PUBLISHED', name: 'Original' })
  })
  it('edit first: publisher validates and publishes the committed new definition', async () => {
    const { q, req } = await fixture()
    const entered = barrier(), release = barrier()
    const editing = call(guard('GENERAL', async (r, res) => { entered.resolve(); await release.promise; return general.update(r, res) }), req)
    await entered.promise
    const publishing = call(guard('GENERAL', publish), req)
    release.resolve()
    expect((await editing).body.code).toBe(0)
    expect((await publishing).body.code).toBe(0)
    expect(await db.questionnaire.findUniqueOrThrow({ where: { id: q.id } })).toMatchObject({ status: 'PUBLISHED', name: 'Changed' })
  })
  it('rolls back child/parent changes when a controller reports an error after writing', async () => {
    const { q, req } = await fixture('COURSE')
    const res = await call(guard('COURSE', async (_r, buffered) => {
      await scoped.$transaction(async tx => { await tx.questionnaireScale.deleteMany({ where: { questionnaireId: q.id } }) })
      await scoped.questionnaire.update({ where: { id: q.id }, data: { name: 'Partial' } })
      return buffered.status(400).json({ code: -1, message: 'rejected' })
    }), req)
    expect(res.statusCode).toBe(400)
    expect((await db.questionnaire.findUniqueOrThrow({ where: { id: q.id } })).name).toBe('Original')
    expect(await db.questionnaireScale.count({ where: { questionnaireId: q.id } })).toBe(1)
  })
  it('isolates concurrent authoring scopes so one transaction cannot mutate another request', async () => {
    const first = await fixture(), second = await fixture()
    await Promise.all([call(guard('GENERAL', general.update), first.req), call(guard('GENERAL', general.update), second.req)])
    expect((await db.questionnaire.findMany({ where: { id: { in: [first.q.id, second.q.id] } } })).every(q => q.name === 'Changed')).toBe(true)
  })
  it('rejects an optional-field legacy copy before creating a target and keeps the original definition', async () => {
    const { q, user } = await fixture()
    await db.questionnaireFormItem.create({ data: { questionnaireId: q.id, type: 'text_input', label: 'Optional', required: false } })
    const copy = (await import('../../modules/questionnaire-product/service')).copy
    const key = randomUUID()
    await expect(copy({ userId: user.id, role: 'TEACHER' }, q.id, { requestId: key })).rejects.toThrow(/普通非必填字段/)
    expect(await db.compositeAssessment.findUnique({ where: { creationKey: user.id + ':' + key } })).toBeNull()
    expect((await db.questionnaireFormItem.findFirstOrThrow({ where: { questionnaireId: q.id } })).required).toBe(false)
  })

})
