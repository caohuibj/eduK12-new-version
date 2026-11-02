import { beforeEach, describe, expect, it, vi } from 'vitest'
import { admitCognitiveAttempt, readCognitiveQuota } from '../../modules/cognitive/attempt-quota'

const root = { id: 'task', courseId: 'course', createdBy: 'author', configId: 'config', maxAttempts: 1 }
const course = { courseType: 'TRAINING_COURSE', isLibrary: false }
const composite = { id: 'bundle', productKind: 'ASSESSMENT_BUNDLE', courseId: 'course', maxAttempts: 1, reportPackageKey: null, analysisProtocolKey: null }
const makeParent = () => ({ id: 'parent', compositeAssessmentId: 'bundle', compositeAssessment: { ...composite }, userId: 'student', status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1 })
const item = { id: 'slot', type: 'COGNITIVE', compositeAssessmentId: 'bundle', cognitiveAssignmentId: 'task' }
let parent: ReturnType<typeof makeParent>
const db = {
  course: { findUnique: vi.fn() }, cognitiveAssignment: { findUnique: vi.fn() },
  compositeAssessmentAttempt: { findUnique: vi.fn(), count: vi.fn() }, compositeAssessmentItem: { findUnique: vi.fn() },
  cognitiveSession: { count: vi.fn(), findFirst: vi.fn() }, $queryRawUnsafe: vi.fn(),
}
const tx = db as any
const scope = { compositeAttemptId: 'parent', compositeItemId: 'slot' }
beforeEach(() => {
  vi.clearAllMocks(); parent = makeParent()
  db.course.findUnique.mockResolvedValue(course)
  db.cognitiveAssignment.findUnique.mockImplementation(async ({ where }) => where.id === 'task' ? root : { ...root, id: where.id, quotaSourceAssignmentId: 'task' })
  db.compositeAssessmentAttempt.findUnique.mockImplementation(async () => parent)
  db.compositeAssessmentAttempt.count.mockResolvedValue(1)
  db.compositeAssessmentItem.findUnique.mockResolvedValue(item)
  db.cognitiveSession.count.mockResolvedValue(0); db.cognitiveSession.findFirst.mockResolvedValue(null)
})
describe('Training participation quotas belong to the delivery task', () => {
  it('counts and resumes standalone aliases without including any composite sessions', async () => {
    db.cognitiveSession.count.mockResolvedValue(1)
    db.cognitiveSession.findFirst.mockResolvedValue({ id: 'existing', compositeAttemptId: null, frozenAdmissionSnapshotHash: 'fixed' })
    expect(await readCognitiveQuota(tx, 'student', 'copy')).toMatchObject({ usedAttempts: 1, remainingAttempts: 0, continueHref: '/student/cognitive/sessions/existing' })
    expect(db.cognitiveSession.count).toHaveBeenCalledWith({ where: expect.objectContaining({ userId: 'student', compositeAttemptId: null, OR: expect.arrayContaining([{ assignmentId: 'task' }]) }) })
    expect(db.cognitiveSession.findFirst.mock.calls[0][0].where.compositeAttemptId).toBeNull()
    await expect(admitCognitiveAttempt(tx, 'student', 'copy')).rejects.toMatchObject({ statusCode: 409 })
    expect(db.cognitiveSession.count.mock.calls.at(-1)![0].where.compositeAttemptId).toBeNull()
  })
  it('does not consume a standalone task allowance when entering a legitimate bundle slot', async () => {
    db.cognitiveSession.count.mockImplementation(async ({ where }) => where.compositeAttemptId === 'parent' ? 0 : 99)
    await admitCognitiveAttempt(tx, 'student', 'copy', scope)
    expect(db.cognitiveSession.count).toHaveBeenCalledExactlyOnceWith({ where: { userId: 'student', compositeAttemptId: 'parent', compositeItemId: 'slot' } })
    expect(db.$queryRawUnsafe.mock.calls[0][1]).toBe('cognitive-task-slot:parent:slot')
  })
  it('refuses duplicate slot materialization, retaining the existing session for continuation', async () => {
    db.cognitiveSession.count.mockResolvedValue(1)
    await expect(admitCognitiveAttempt(tx, 'student', 'task', scope)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('allows another delivery of the same tool but enforces the parent participation limit', async () => {
    await admitCognitiveAttempt(tx, 'student', 'task', scope)
    parent = { ...makeParent(), id: 'second-parent', compositeAssessmentId: 'second', compositeAssessment: { ...composite, id: 'second' } }
    db.compositeAssessmentItem.findUnique.mockResolvedValue({ ...item, compositeAssessmentId: 'second' })
    await admitCognitiveAttempt(tx, 'student', 'task', { ...scope, compositeAttemptId: 'second-parent' })
    db.compositeAssessmentAttempt.count.mockResolvedValue(2)
    await expect(admitCognitiveAttempt(tx, 'student', 'task', { ...scope, compositeAttemptId: 'second-parent' })).rejects.toMatchObject({ statusCode: 409 })
  })
  it.each(['actor', 'item', 'source', 'parent', 'terminal'] as const)('does not use a mismatched %s as quota authority', async change => {
    if (change === 'actor') parent.userId = 'other'
    if (change === 'item') db.compositeAssessmentItem.findUnique.mockResolvedValue({ ...item, compositeAssessmentId: 'other' })
    if (change === 'source') db.cognitiveAssignment.findUnique.mockImplementation(async ({ where }) => ({ ...root, id: where.id }))
    if (change === 'parent') db.compositeAssessmentAttempt.findUnique.mockResolvedValue(null)
    if (change === 'terminal') parent.status = 'COMPLETED'
    await expect(admitCognitiveAttempt(tx, 'student', change === 'source' ? 'other-config-task' : 'task', scope)).rejects.toMatchObject({ statusCode: 409 })
    expect(db.cognitiveSession.count).not.toHaveBeenCalled()
  })
  it('keeps legacy and non-Training quota behavior unchanged', async () => {
    db.course.findUnique.mockResolvedValue({ courseType: 'LEGACY_COURSE', isLibrary: false })
    await readCognitiveQuota(tx, 'student', 'task')
    expect(db.cognitiveSession.count.mock.calls[0][0].where).not.toHaveProperty('compositeAttemptId')
  })
})
