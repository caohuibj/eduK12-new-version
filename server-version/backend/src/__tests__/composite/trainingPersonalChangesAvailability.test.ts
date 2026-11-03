import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { compositeAssessmentAttempt: { findUnique: mocks.findUnique } } }))
import { readTrainingPersonalChangesAvailability } from '../../modules/composite/personal-tracking.service'

const attempt = {
  userId: 'student', status: 'COMPLETED', completedAt: new Date(), assignmentRef: null,
  subjectUserId: null, respondentUserId: null, compositeAssessment: { personalTrackingBaselineId: null as string | null },
}
beforeEach(() => mocks.findUnique.mockReset())
describe('personal changes availability', () => {
  it('reports whether an own completed attempt has longitudinal tracking', async () => {
    mocks.findUnique.mockResolvedValueOnce(attempt).mockResolvedValueOnce({ ...attempt, compositeAssessment: { personalTrackingBaselineId: 'baseline' } })
    await expect(readTrainingPersonalChangesAvailability('attempt', 'student')).resolves.toEqual({ configured: false })
    await expect(readTrainingPersonalChangesAvailability('attempt', 'student')).resolves.toEqual({ configured: true })
  })
  it('does not reveal configuration for another user or an unfinished attempt', async () => {
    mocks.findUnique.mockResolvedValueOnce(attempt).mockResolvedValueOnce({ ...attempt, status: 'IN_PROGRESS' })
    await expect(readTrainingPersonalChangesAvailability('attempt', 'other')).rejects.toMatchObject({ statusCode: 403 })
    await expect(readTrainingPersonalChangesAvailability('attempt', 'student')).rejects.toMatchObject({ statusCode: 403 })
  })
})
