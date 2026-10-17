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
for (const [name, controller] of [['assignment', assignmentController], ['checkin', checkinController]] as const) describe(name + ' exact detail contract', () => {
  const request = (userId: string, role = 'TEACHER', query = {}) => ({ user: { userId, role }, params: { id: 'task' }, query }) as any
  it('returns management metadata and submission count for the owner', async () => { const r = res(); await controller.detail(request('owner'), r); expect(r.code).toBe(200); expect(r.value.data).toMatchObject({ courseId: 'course', tags: ['retained'], _count: { submissions: 2 } }); expect(r.value.data.course.shares).toBeUndefined() })
  it('keeps existing admin management authority', async () => { const r = res(); await controller.detail(request('admin', 'ADMIN'), r); expect(r.value.data._count).toEqual({ submissions: 2 }) })
  it('keeps a content share read-only without exposing submission counts', async () => { const r = res(); await controller.detail(request('shared'), r); expect(r.code).toBe(200); expect(r.value.data._count).toBeUndefined(); expect(r.value.data.course.shares).toBeUndefined() })
  it('does not expose counts to a student', async () => { const r = res(); await controller.detail(request('student', 'STUDENT'), r); expect(r.code).toBe(200); expect(r.value.data._count).toBeUndefined(); if (name === 'assignment') expect(r.value.data.mySubmission.studentId).toBe('student') })
  it('rejects a mismatched course context before hydrating data', async () => { const r = res(); await controller.detail(request('owner', 'TEACHER', { courseId: 'wrong' }), r); expect(r.code).toBe(404); expect(hydrate).not.toHaveBeenCalled() })
  it('denies an unrelated trainer', async () => { const r = res(); await controller.detail(request('foreign'), r); expect(r.code).toBe(403); expect(hydrate).not.toHaveBeenCalled() })
  it('denies a revoked student membership', async () => { db.courseStudent.findFirst.mockResolvedValue(null); const r = res(); await controller.detail(request('student', 'STUDENT'), r); expect(r.code).toBe(403); expect(hydrate).not.toHaveBeenCalled() })
})
