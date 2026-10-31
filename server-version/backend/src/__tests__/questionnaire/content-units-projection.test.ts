import { beforeEach, expect, it, vi } from 'vitest'
import { generalQuestionnaireController } from '../../controllers/generalQuestionnaireController'
import { questionnaireController } from '../../controllers/questionnaireController'

const mocks = vi.hoisted(() => ({ header: vi.fn(), forms: vi.fn(), scales: vi.fn(), units: vi.fn(), manage: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { questionnaire: { findFirst: mocks.header },
  questionnaireFormItem: { findMany: mocks.forms }, questionnaireScale: { findMany: mocks.scales } } }))
vi.mock('../../services/questionnaireAuthorizationService', () => ({ questionnaireAuthorizationService: {
  canManageGeneral: mocks.manage, canManage: mocks.manage,
} }))
vi.mock('../../services/questionnaire-form-section.service', () => ({ listQuestionnaireContentUnits: mocks.units }))

const units = [{ type: 'form-section', id: 'section', label: '基本信息', position: 0, itemCount: 1, contextSection: false }]
const form = { id: 'field', position: 1, label: '年级' }
const scale = { id: 'scale', position: 0, scale: { definition: { items: [{ itemCode: 'score', content: '合成题目' }] } } }
const variants = [ ['GENERAL', generalQuestionnaireController], ['COURSE', questionnaireController] ] as const
beforeEach(() => {
  vi.clearAllMocks()
  mocks.header.mockResolvedValue({ id: 'q', creatorId: 'teacher' })
  mocks.manage.mockResolvedValue(true); mocks.units.mockResolvedValue(units)
  mocks.forms.mockResolvedValue([form]); mocks.scales.mockResolvedValue([scale])
})
async function request(controller: typeof questionnaireController | typeof generalQuestionnaireController, query = {}) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
  await controller.listContent({ params: { id: 'q' }, query, user: { userId: 'teacher', role: 'TEACHER' } } as any, res as any)
  return res
}

it.each(variants)('%s units-only content skips both discarded payload reads after authorization', async (type, controller) => {
  const res = await request(controller, { projection: 'units' })
  expect(mocks.forms).not.toHaveBeenCalled(); expect(mocks.scales).not.toHaveBeenCalled()
  expect(mocks.header).toHaveBeenCalledExactlyOnceWith({ where: { id: 'q', type } })
  expect(mocks.manage).toHaveBeenCalledTimes(1); expect(mocks.units).toHaveBeenCalledExactlyOnceWith('q')
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0, data: { units } }))
})
it.each(variants)('%s default content preserves full sorted list, definitions and total', async (_type, controller) => {
  const res = await request(controller)
  expect(mocks.forms).toHaveBeenCalledTimes(1); expect(mocks.scales).toHaveBeenCalledTimes(1)
  expect(mocks.scales.mock.calls[0][0].include.scale.select.definition).toBe(true)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0, data: {
    units, total: 2, list: [{ type: 'scale', id: 'scale', position: 0, data: scale }, { type: 'form', id: 'field', position: 1, data: form }],
  } }))
})
it.each(variants)('%s units-only content still refuses a non-manager before reading content', async (_type, controller) => {
  mocks.manage.mockResolvedValue(false)
  const res = await request(controller, { projection: 'units' })
  expect(res.status).toHaveBeenCalledWith(403)
  expect(mocks.units).not.toHaveBeenCalled(); expect(mocks.forms).not.toHaveBeenCalled(); expect(mocks.scales).not.toHaveBeenCalled()
})
