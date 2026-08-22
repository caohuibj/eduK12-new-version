import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UserRole } from '@prisma/client'

// mock service 模块：api 测试聚焦 鉴权/参数解析/响应形状
vi.mock('../../modules/cognitive/assignment.service', () => ({
  createAssignment: vi.fn(),
  listTeacherAssignments: vi.fn(),
  listStudentAssignments: vi.fn(),
  getAssignmentForTeacher: vi.fn(),
  getAssignmentForStudent: vi.fn(),
  updateDraftAssignment: vi.fn(),
  publishAssignment: vi.fn(),
  archiveAssignment: vi.fn(),
  CognitiveServiceError: class CognitiveServiceError extends Error {
    statusCode: number
    constructor(message: string, statusCode: number) {
      super(message)
      this.statusCode = statusCode
    }
  },
}))

import * as assignmentService from '../../modules/cognitive/assignment.service'
import { cognitiveController } from '../../modules/cognitive/cognitive.controller'

const makeReq = (overrides: any = {}) => ({
  user: { userId: 'teacher-1', username: 't1', role: UserRole.TEACHER },
  body: {},
  query: {},
  params: {},
  ...overrides,
})

const makeRes = () => {
  const res: any = { statusCode: 0, body: null }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: any) => {
    res.body = body
    return res
  })
  return res
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('cognitive assignment API', () => {
  it('rejects unauthenticated access', async () => {
    const req = makeReq({ user: undefined })
    const res = makeRes()
    await cognitiveController.myAssignments(req, res)
    expect(res.statusCode).toBe(401)
  })

  it('forbids STUDENT from teacher-only create', async () => {
    const req = makeReq({
      user: { userId: 'student-1', username: 's1', role: UserRole.STUDENT },
      body: { courseId: 'course-1', configId: 'config-1', title: 'x' },
    })
    const res = makeRes()
    // controller 依赖 route 中间件 requireTeacher；service 层也二次校验
    ;(assignmentService.createAssignment as any).mockRejectedValue({
      statusCode: 403,
      message: 'Teacher role required',
    })
    await cognitiveController.createAssignment(req, res)
    expect(res.statusCode).toBe(403)
  })

  it('returns 400 when strict schema rejects forged fields', async () => {
    const req = makeReq({
      body: {
        courseId: 'course-1',
        configId: 'config-1',
        title: 'x',
        status: 'PUBLISHED', // 越权字段
      },
    })
    const res = makeRes()
    await cognitiveController.createAssignment(req, res)
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe(-1)
  })

  it('returns 400 when dueAt precedes opensAt', async () => {
    const req = makeReq({
      body: {
        courseId: 'course-1',
        configId: 'config-1',
        title: 'x',
        opensAt: '2026-02-01T00:00:00Z',
        dueAt: '2026-01-01T00:00:00Z',
      },
    })
    const res = makeRes()
    await cognitiveController.createAssignment(req, res)
    expect(res.statusCode).toBe(400)
  })

  it('lists published assignments even when the client sends a cache-buster query', async () => {
    const req = makeReq({ query: { status: 'PUBLISHED', _t: '1787380000000' } })
    const res = makeRes()
    ;(assignmentService.listTeacherAssignments as any).mockResolvedValue([{ id: 'asg-1', title: '反应时（体验）', status: 'PUBLISHED' }])
    await cognitiveController.listAssignments(req, res)
    expect(res.body.code).toBe(0)
    expect(assignmentService.listTeacherAssignments).toHaveBeenCalledWith('teacher-1', UserRole.TEACHER, {
      status: 'PUBLISHED',
    })
    expect(res.body.data).toEqual([{ id: 'asg-1', title: '反应时（体验）', status: 'PUBLISHED' }])
  })

  it('returns code:0 with data on success', async () => {
    const req = makeReq({
      body: { courseId: 'course-1', configId: 'config-1', title: 'x' },
    })
    const res = makeRes()
    ;(assignmentService.createAssignment as any).mockResolvedValue({ id: 'asg-1', status: 'DRAFT' })
    await cognitiveController.createAssignment(req, res)
    expect(res.body.code).toBe(0)
    expect(res.body.data.status).toBe('DRAFT')
  })

  it('maps service 404 to HTTP 404', async () => {
    const req = makeReq({ params: { id: 'asg-1' } })
    const res = makeRes()
    ;(assignmentService.publishAssignment as any).mockRejectedValue({
      statusCode: 404,
      message: 'CognitiveAssignment not found',
    })
    await cognitiveController.publishAssignment(req, res)
    expect(res.statusCode).toBe(404)
  })

  it('student GET /:id returns assignment without run config JSON', async () => {
    const req = makeReq({
      user: { userId: 'student-1', username: 's1', role: UserRole.STUDENT },
      params: { id: 'asg-1' },
    })
    const res = makeRes()
    ;(assignmentService.getAssignmentForStudent as any).mockResolvedValue({
      id: 'asg-1',
      title: 'x',
      config: { id: 'config-1', testType: 'fake', configVersion: '1.0.0' },
    })
    await cognitiveController.getAssignment(req, res)
    expect(res.body.code).toBe(0)
    expect(res.body.data.config.config).toBeUndefined()
  })
})
