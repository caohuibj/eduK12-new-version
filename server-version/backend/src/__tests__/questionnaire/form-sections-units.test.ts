import { beforeEach, expect, it, vi } from 'vitest'
import { generalQuestionnaireController } from '../../controllers/generalQuestionnaireController'
import { questionnaireController } from '../../controllers/questionnaireController'

// Real section service and definition hashing; only persistence and authorization
// are synthetic. Counts below are Prisma delegate calls, NOT database SQL counts.
const mocks = vi.hoisted(() => ({ header: vi.fn(), current: vi.fn(), sections: vi.fn(), scales: vi.fn(),
  create: vi.fn(), update: vi.fn(), transaction: vi.fn(), manage: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: {
  questionnaire: { findFirst: mocks.header, findUnique: mocks.current },
  questionnaireFormSection: { findMany: mocks.sections, create: mocks.create },
  questionnaireFormItem: { update: mocks.update }, questionnaireScale: { findMany: mocks.scales },
  $transaction: mocks.transaction,
} }))
vi.mock('../../services/questionnaireAuthorizationService', () => ({ questionnaireAuthorizationService: {
  canManageGeneral: mocks.manage, canManage: mocks.manage,
} }))
const variants = [['GENERAL', generalQuestionnaireController], ['COURSE', questionnaireController]] as const
const field = { id: 'field', type: 'text_input', label: 'field', options: null, position: 0, sectionId: 'context', sectionPosition: 0, contextKey: 'gradeLevel' }
const section = { id: 'context', title: 'Context', position: 0, contextSection: false, items: [field] }
const scale = { id: 'scale', position: 1, scale: { name: 'Scale' } }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.header.mockResolvedValue({ id: 'q', creatorId: 'teacher' })
  mocks.manage.mockResolvedValue(true)
  mocks.current.mockResolvedValue({ formItems: [field], questionnaireScales: [scale], formSections: [section] })
  mocks.sections.mockResolvedValue([section]); mocks.scales.mockResolvedValue([scale])
  mocks.create.mockResolvedValue(section)
  mocks.transaction.mockImplementation(async callback => callback({ questionnaire: { findUnique: mocks.current },
    questionnaireFormSection: { create: mocks.create }, questionnaireFormItem: { update: mocks.update } }))
})
async function request(controller: typeof questionnaireController | typeof generalQuestionnaireController, query = {}, content = false) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
  await controller[content ? 'listContent' : 'listFormSections']({ params: { id: 'q' }, query, user: { userId: 'teacher', role: 'TEACHER' } } as any, res as any)
  return res
}
it.each(variants)('%s combines once-repaired sections and ordered units, instead of duplicate ensure', async (type, controller) => {
  const sectionResponse = await request(controller)
  const contentResponse = await request(controller, { projection: 'units' }, true)
  expect(mocks.current).toHaveBeenCalledTimes(2)
  expect(mocks.sections).toHaveBeenCalledTimes(2)
  const list = sectionResponse.json.mock.calls[0][0].data.list
  const units = contentResponse.json.mock.calls[0][0].data.units
  vi.clearAllMocks()
  const combined = await request(controller, { include: 'units' })
  expect(combined.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0, data: { list, units } }))
  expect(units.map((unit: any) => [unit.type, unit.id, unit.position])).toEqual([['form-section', 'context', 0], ['scale', 'scale', 1]])
  expect(units[0].contextSection).toBe(true)
  expect(mocks.header).toHaveBeenCalledExactlyOnceWith({ where: { id: 'q', type } })
  expect(mocks.manage).toHaveBeenCalledTimes(1)
  expect(mocks.current).toHaveBeenCalledTimes(1)
  expect(mocks.sections).toHaveBeenCalledTimes(1)
  expect(mocks.scales).toHaveBeenCalledTimes(1)
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it.each(variants)('%s retains old-data repair before both projections', async (_type, controller) => {
  mocks.current.mockResolvedValue({ formItems: [{ ...field, sectionId: null }], questionnaireScales: [scale], formSections: [] })
  const res = await request(controller, { include: 'units' })
  expect(res.json.mock.calls[0][0].code).toBe(0)
  expect(mocks.transaction).toHaveBeenCalledTimes(1)
  expect(mocks.current).toHaveBeenCalledTimes(2) // initial + transaction recheck
  expect(mocks.create).toHaveBeenCalledTimes(1)
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ where: { id: 'field' }, data: { sectionId: 'context', sectionPosition: 0 } })
  expect(mocks.sections).toHaveBeenCalledTimes(1)
  expect(res.json.mock.calls[0][0].data.units[0]).toMatchObject({ id: 'context', itemCount: 1, contextSection: true })
})
it.each(variants)('%s keeps the default DTO and does not fetch scales', async (_type, controller) => {
  const res = await request(controller)
  expect(Object.keys(res.json.mock.calls[0][0].data)).toEqual(['list'])
  expect(res.json.mock.calls[0][0].data.list[0].definitionHash).toEqual(expect.any(String))
  expect(mocks.scales).not.toHaveBeenCalled()
})
it.each(variants)('%s denies a non-manager before repair or projections', async (_type, controller) => {
  mocks.manage.mockResolvedValue(false)
  const res = await request(controller, { include: 'units' })
  expect(res.status).toHaveBeenCalledWith(403)
  expect(mocks.current).not.toHaveBeenCalled(); expect(mocks.sections).not.toHaveBeenCalled(); expect(mocks.scales).not.toHaveBeenCalled()
})
