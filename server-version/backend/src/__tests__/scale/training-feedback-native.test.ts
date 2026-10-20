import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { db, project } = vi.hoisted(() => ({ db: { assessment: { findUnique: vi.fn() }, compositeAssessmentAttempt: { findUnique: vi.fn() },
  compositeReportJob: { findUnique: vi.fn() }, $queryRaw: vi.fn() }, project: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../modules/scale/scale-workflow.service', async importOriginal => ({ ...await importOriginal<any>(), loadScaleAssessmentForResponse: project }))
import { scaleController } from '../../controllers/scaleController'
import { feedbackAttempt } from '../fixtures/training-feedback'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
let parent: any, row: any
const response = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() }) as any
beforeEach(() => {
  vi.resetAllMocks(); parent = feedbackAttempt(); row = { id: 'scale-1', userId: 'student-1', compositeAttemptId: parent.id, compositeAttempt: parent, status: 'COMPLETED' }
  db.assessment.findUnique.mockImplementation(async () => row); db.compositeAssessmentAttempt.findUnique.mockImplementation(async () => parent)
  project.mockResolvedValue({ id: row.id, report: 'PRIVATE_REPORT' })
})
afterEach(() => vi.useRealTimers())
describe('native Scale Training feedback reads', () => {
  it('preserves typed readiness rejection while keeping unknown read failures generic', async () => {
    const pending = response()
    db.assessment.findUnique.mockRejectedValueOnce(new InstrumentFinalSubmitError(
      'STALE_ATTEMPT', '请先提交人口学上下文并冻结参考选择', 409,
    ))
    await scaleController.getAssessmentV2({ params: { assessmentId: row.id }, user: { userId: 'student-1' } } as any, pending)
    expect(pending.status).toHaveBeenCalledWith(409)
    expect(pending.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'STALE_ATTEMPT', data: null }))
    expect(project).not.toHaveBeenCalled()
    const unexpected = response()
    db.assessment.findUnique.mockRejectedValueOnce(new Error('private diagnostic must not escape'))
    await scaleController.getAssessmentV2({ params: { assessmentId: row.id }, user: { userId: 'student-1' } } as any, unexpected)
    expect(unexpected.status).toHaveBeenCalledWith(400)
    expect(unexpected.json).toHaveBeenCalledWith({ code: -1, message: '获取测评结果失败', data: null })
    expect(project).not.toHaveBeenCalled()
  })
  it('checks frozen release before result projection without re-reading the parent', async () => {
    const res = response()
    await scaleController.getAssessmentV2({ params: { assessmentId: row.id }, user: { userId: 'student-1' } } as any, res)
    expect(res.status).toHaveBeenCalledWith(403); expect(project).not.toHaveBeenCalled()
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(db.$queryRaw).not.toHaveBeenCalled(); expect(db.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
    expect(db.assessment.findUnique.mock.calls[0][0].include.compositeAttempt.select).toMatchObject({ trainingFeedbackSnapshot: true, trainingFeedbackSnapshotHash: true })
  })
  it('opens at the exact boundary while retaining the existing result projection', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T00:00:00.000Z'))
    const res = response()
    await scaleController.getAssessmentV2({ params: { assessmentId: row.id }, user: { userId: 'student-1' } } as any, res)
    expect(project).toHaveBeenCalledWith(row); expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { id: row.id, report: 'PRIVATE_REPORT' } }))
  })
  it('preserves standalone feedback and rejects cross-user reads', async () => {
    row.compositeAttemptId = null; row.compositeAttempt = null
    await scaleController.getAssessmentV2({ params: { assessmentId: row.id }, user: { userId: 'student-1' } } as any, response())
    expect(project).toHaveBeenCalledTimes(1)
    const forbidden = response()
    await scaleController.getAssessmentV2({ params: { assessmentId: row.id }, user: { userId: 'other' } } as any, forbidden)
    expect(forbidden.status).toHaveBeenCalledWith(403); expect(project).toHaveBeenCalledTimes(1)
  })
})
