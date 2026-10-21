import {beforeEach, describe, expect, it, vi} from 'vitest'

const mocks = vi.hoisted(() => ({
  db: {
    questionnaire: {findFirst: vi.fn(), create: vi.fn()},
    scale: {findUnique: vi.fn()},
    questionnaireScale: {createMany: vi.fn()},
    questionnaireFormItem: {createMany: vi.fn()},
    questionnaireFormSection: {create: vi.fn()},
    user: {findFirst: vi.fn()},
    $transaction: vi.fn(), $queryRaw: vi.fn(),
  },
  canManage: vi.fn(), canUseScale: vi.fn(), grants: vi.fn(), sections: vi.fn(),
}))
vi.mock('../../config/database', () => ({prisma: mocks.db}))
vi.mock('../../services/legacyQuestionnaireDatabase', () => ({legacyQuestionnaireDb: mocks.db}))
vi.mock('../../services/questionnaireAuthorizationService', () => ({questionnaireAuthorizationService: {canManageGeneral: mocks.canManage}}))
vi.mock('../../services/materialGrant', () => ({
  canUseScale: mocks.canUseScale, grantedResourceIds: mocks.grants,
  MaterialGrantError: class extends Error { constructor(message: string, public statusCode: number) { super(message) } },
}))
vi.mock('../../services/questionnaire-form-section.service', () => ({ensureQuestionnaireFormSections: mocks.sections}))
import {generalQuestionnaireController} from '../../controllers/generalQuestionnaireController'

const source = () => ({id: 'source', type: 'GENERAL', status: 'PUBLISHED', creatorId: 'owner',
  code: 'source-code', name: 'Source', formItems: [], formSections: [],
  questionnaireScales: [{scaleId: 'exact-scale-version', position: 0}],
  accessTokens: [{token: 'never-copy-token'}], assessments: [{answers: 'never-copy-answers'}],
})
const invoke = async () => {
  const res: any = {statusCode: 200, status(code: number) {this.statusCode = code; return this}, json(body: unknown) {this.body = body; return this}}
  await generalQuestionnaireController.duplicate({user: {userId: 'viewer', role: 'TEACHER'}, params: {id: 'source'}} as any, res)
  return res
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.questionnaire.findFirst.mockResolvedValue(source())
  mocks.db.questionnaire.create.mockResolvedValue({id: 'copy'})
  mocks.db.scale.findUnique.mockResolvedValue({id: 'exact-scale-version', creatorId: 'author', status: 'PUBLISHED'})
  mocks.db.$transaction.mockImplementation((fn: (tx: typeof mocks.db) => unknown) => fn(mocks.db))
  mocks.canManage.mockResolvedValue(true)
  mocks.canUseScale.mockResolvedValue(false)
  mocks.grants.mockResolvedValue([])
})
describe('GENERAL copies require independent current scale authorization', () => {
  it('rejects a source manager when independent scale authorization fails', async () => {
    expect((await invoke()).statusCode).toBe(403)
    expect(mocks.canUseScale).toHaveBeenCalledWith('viewer', 'TEACHER', expect.objectContaining({id: 'exact-scale-version'}), mocks.db)
    expect(mocks.db.questionnaire.create).not.toHaveBeenCalled()
    expect(mocks.db.questionnaireScale.createMany).not.toHaveBeenCalled()
  })
  it('never treats a form grant as permission to copy a contained scale', async () => {
    mocks.canManage.mockResolvedValue(false)
    mocks.grants.mockResolvedValue(['source'])
    expect((await invoke()).statusCode).toBe(403)
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })
  it('rejects a template grant revoked before the write transaction and creates no draft', async () => {
    mocks.db.questionnaire.findFirst.mockResolvedValue({...source(), questionnaireScales: []})
    mocks.canManage.mockResolvedValue(false)
    mocks.grants.mockResolvedValue(['source'])
    mocks.db.user.findFirst.mockResolvedValue({id: 'owner'})
    mocks.db.$queryRaw.mockResolvedValue([])
    expect((await invoke()).statusCode).toBe(403)
    expect(mocks.db.$queryRaw).toHaveBeenCalled()
    expect(mocks.db.questionnaire.create).not.toHaveBeenCalled()
  })
  it('creates a new hidden draft only with exact scale authorization, without source tokens or responses', async () => {
    mocks.canUseScale.mockResolvedValue(true)
    expect((await invoke()).statusCode).toBe(200)
    const data = mocks.db.questionnaire.create.mock.calls[0][0].data
    expect(data).toMatchObject({creatorId: 'viewer', status: 'DRAFT', visibility: 'HIDDEN'})
    expect(JSON.stringify(data)).not.toMatch(/never-copy|accessTokens|assessments/)
    expect(mocks.db.questionnaireScale.createMany).toHaveBeenCalledWith({data: [{questionnaireId: 'copy', scaleId: 'exact-scale-version', position: 0}]})
  })
})
