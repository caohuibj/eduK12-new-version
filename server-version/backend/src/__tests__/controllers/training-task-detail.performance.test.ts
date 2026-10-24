import { beforeEach, describe, expect, it, vi } from 'vitest'
const { db, hydrate } = vi.hoisted(() => ({ db: {
  assignment: { findUnique: vi.fn() }, checkin: { findUnique: vi.fn() },
  submission: { findFirst: vi.fn() }, courseStudent: { findFirst: vi.fn() }, $queryRaw: vi.fn(),
}, hydrate: vi.fn(async (v: unknown) => v) }))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../services/assetStorage', () => ({ hydrateAssetReferences: hydrate, hydrateAssetReferenceBatch: vi.fn(),
  AssetReferenceValidationError: class extends Error {}, syncAssetReferences: vi.fn(), validateAssetReferencesForCourse: vi.fn(),
  attachAssetReference: vi.fn(), discardUnreferencedAsset: vi.fn(), signKnownAsset: vi.fn(), storeAsset: vi.fn() }))
import { assignmentController } from '../../controllers/assignmentController'
import { checkinController } from '../../controllers/checkinController'
const res = () => { const r: any = { code: 200 }; r.status = vi.fn((code) => { r.code = code; return r }); r.json = vi.fn((value) => { r.value = value; return r }); return r }
const row = { id: 'task', courseId: 'course', tags: ['retained'], status: 'PUBLISHED', _count: { submissions: 2 },
  course: { id: 'course', title: 'Course', creatorId: 'owner', shares: [{ sharedTo: 'shared' }] } }
beforeEach(() => { vi.clearAllMocks(); db.assignment.findUnique.mockResolvedValue(row); db.checkin.findUnique.mockResolvedValue(row);
  db.courseStudent.findFirst.mockResolvedValue({ id: 'membership' }); db.submission.findFirst.mockResolvedValue({ studentId: 'student' }); db.$queryRaw.mockResolvedValue([{ allowed: false }]) })
for (const [name, controller] of [['assignment', assignmentController], ['checkin', checkinController]] as const) describe(name + ' learner detail aggregate projection', () => {
  const request = (userId: string, role = 'TEACHER', query = {}) => ({ user: { userId, role }, params: { id: 'task' }, query }) as any
  const projection = () => { const args = db[name].findUnique.mock.calls[0][0]; return args.select || args.include }
  it('omits the student aggregate without changing membership or own response reads', async () => {
    db[name].findUnique.mockImplementation(async (args: any) => {
      expect((args.select || args.include)._count).toBe(false)
      const { _count, ...studentRow } = row
      return studentRow
    })
    const r = res(); await controller.detail(request('student', 'STUDENT'), r)
    expect(r.code).toBe(200); expect(r.value.data._count).toBeUndefined()
    expect(db.courseStudent.findFirst).toHaveBeenCalledOnce()
    if (name === 'assignment') expect(r.value.data.mySubmission.studentId).toBe('student')
  })
  for (const [userId, role] of [['owner', 'TEACHER'], ['admin', 'ADMIN'], ['shared', 'TEACHER']]) {
    it('preserves the aggregate query for ' + userId, async () => {
      const r = res(); await controller.detail(request(userId, role), r)
      expect(projection()._count).toEqual({ select: { submissions: true } })
      expect(r.code).toBe(200)
      expect(r.value.data._count).toEqual(userId === 'shared' ? undefined : { submissions: 2 })
    })
  }
  it('still denies foreign course context before membership and hydration', async () => {
    const r = res(); await controller.detail(request('student', 'STUDENT', { courseId: 'foreign' }), r)
    expect(r.code).toBe(404); expect(db.courseStudent.findFirst).not.toHaveBeenCalled(); expect(hydrate).not.toHaveBeenCalled()
  })
  it('still denies revoked membership without hydrating data', async () => {
    db.courseStudent.findFirst.mockResolvedValue(null)
    const r = res(); await controller.detail(request('student', 'STUDENT'), r)
    expect(r.code).toBe(403); expect(hydrate).not.toHaveBeenCalled()
  })
})
