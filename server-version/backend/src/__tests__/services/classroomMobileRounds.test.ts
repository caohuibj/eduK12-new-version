import { beforeEach, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ end: vi.fn(), submit: vi.fn(), notifyEnd: vi.fn(), notifyAnswer: vi.fn() }))
vi.mock('../../config', () => ({ config: { miniClassroomEnabled: true } }))
vi.mock('../../config/database', () => ({ prisma: { classroomSession: { findUnique: vi.fn(async () => ({ id: 's', classroomId: 'c', isTemporary: false, leftAt: null })) } } }))
vi.mock('../../middleware/auth', () => ({ authenticate: vi.fn(), requireBusinessRole: () => vi.fn() }))
vi.mock('../../middleware/redisRateLimit', () => ({ createRedisRateLimiter: () => vi.fn() }))
vi.mock('../../utils/classroomRateLimiter', () => ({ checkClassroomLookupRateLimit: vi.fn(), checkFailedClassroomCodeRateLimit: vi.fn() }))
vi.mock('../../middleware/classroomAccess', () => ({ findClassroomAccess: vi.fn(async () => ({ id: 'c' })), canManageClassroom: () => true }))
vi.mock('../../services/classroomSocketHandler', () => ({ classroomSocketHandler: { notifyQuestionEnded: m.notifyEnd, notifyAnswerSubmitted: m.notifyAnswer } }))
vi.mock('../../services/classroomLifecycleService', () => ({
  endClassroomQuestion: m.end, submitClassroomAnswer: m.submit,
  joinClassroomStudent: vi.fn(), startClassroomQuestion: vi.fn(), closeClassroom: vi.fn(), leaveClassroomStudent: vi.fn(),
  ClassroomLifecycleError: class extends Error {},
}))
import { classroomRuntimeRouter } from '../../modules/mobile/classroom.routes'

const startedAt = new Date('2026-11-27T08:00:00.000Z'), endedAt = new Date('2026-11-27T08:01:00.000Z')
async function invoke(path: string, body: unknown, role = 'TEACHER') {
  const layer = classroomRuntimeRouter.stack.find((entry: any) => entry.route?.path === path)
  const res: any = { status: vi.fn(), json: vi.fn() }
  res.status.mockReturnValue(res); res.json.mockReturnValue(res)
  const next = vi.fn()
  await layer!.route!.stack[0].handle({ params: { id: 'c' }, body, user: { role, userId: 'student' } } as any, res, next)
  expect(next).not.toHaveBeenCalled()
  return res
}
beforeEach(() => {
  vi.clearAllMocks()
  m.end.mockResolvedValue({ changed: true, startedAt, endedAt })
  m.submit.mockResolvedValue({ questionId: 'q', alreadySubmitted: false, expired: false, startedAt, endedAt: null })
})
it('uses the end transaction marker for mobile notifications and keeps missing request markers invalid', async () => {
  await invoke('/:id/end', { questionId: 'q', startedAt: startedAt.toISOString() })
  expect(m.notifyEnd).toHaveBeenCalledWith('c', 'q', startedAt, endedAt)
  m.notifyEnd.mockClear()
  const invalid = await invoke('/:id/end', { questionId: 'q' })
  expect(invalid.status).toHaveBeenCalledWith(400)
  expect(m.notifyEnd).not.toHaveBeenCalled()
})
it.each([false, true])('schedules mobile answer statistics only for a new write (duplicate=%s)', async duplicate => {
  m.submit.mockResolvedValue({ questionId: 'q', alreadySubmitted: duplicate, expired: false, startedAt, endedAt: null })
  await invoke('/:id/submit', { questionId: 'q', startedAt: startedAt.toISOString(), answer: 'A' }, 'STUDENT')
  if (duplicate) expect(m.notifyAnswer).not.toHaveBeenCalled()
  else expect(m.notifyAnswer).toHaveBeenCalledWith('c', 'q', startedAt)
})
it('uses the committed expired round for mobile end notifications', async () => {
  m.submit.mockResolvedValue({ questionId: 'q', alreadySubmitted: false, expired: true, startedAt, endedAt })
  const res = await invoke('/:id/submit', { questionId: 'q', startedAt: startedAt.toISOString(), answer: 'A' }, 'STUDENT')
  expect(m.notifyEnd).toHaveBeenCalledWith('c', 'q', startedAt, endedAt)
  expect(m.notifyAnswer).not.toHaveBeenCalled()
  expect(res.status).toHaveBeenCalledWith(409)
})
