import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ attempt: vi.fn(), user: vi.fn(), membership: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: {
  compositeAssessmentAttempt: { findUnique: mocks.attempt },
  user: { findUnique: mocks.user },
  courseStudent: { findFirst: mocks.membership },
} }))
import { readTrainingPersonalChangesAvailability } from '../../modules/composite/personal-tracking.service'

const publication = {
  personalTrackingBaselineId: null as string | null, createdBy: 'trainer',
  status: 'PUBLISHED', productKind: 'QUESTIONNAIRE', courseId: null,
}
const attempt = {
  userId: 'student', status: 'COMPLETED', completedAt: new Date(), assignmentRef: null,
  subjectUserId: null, respondentUserId: null, deliveryCourseId: 'course',
  compositeAssessment: publication,
}
const configuredAttempt = { ...attempt, compositeAssessment: { ...publication, personalTrackingBaselineId: 'baseline' } }
const activeUser = { isActive: true, isFrozen: false, expiresAt: null, accountDomain: 'TRAINING' }
beforeEach(() => {
  mocks.attempt.mockReset()
  mocks.user.mockReset().mockResolvedValue(activeUser)
  mocks.membership.mockReset().mockResolvedValue({ id: 'current-member' })
})
describe('personal changes availability', () => {
  it('shows the action only for an eligible configured own attempt', async () => {
    mocks.attempt.mockResolvedValueOnce(attempt).mockResolvedValueOnce(configuredAttempt)
    await expect(readTrainingPersonalChangesAvailability('attempt', 'student')).resolves.toEqual({ configured: false })
    await expect(readTrainingPersonalChangesAvailability('attempt', 'student')).resolves.toEqual({ configured: true })
    expect(mocks.membership).toHaveBeenCalledTimes(1)
  })
  it('does not disclose configuration for another user or an unfinished attempt', async () => {
    mocks.attempt.mockResolvedValueOnce(attempt).mockResolvedValueOnce({ ...attempt, status: 'IN_PROGRESS' })
    await expect(readTrainingPersonalChangesAvailability('attempt', 'other')).rejects.toMatchObject({ statusCode: 403 })
    await expect(readTrainingPersonalChangesAvailability('attempt', 'student')).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.user).not.toHaveBeenCalled()
  })
  it('hides action after course membership is revoked', async () => {
    mocks.attempt.mockResolvedValue(configuredAttempt)
    mocks.membership.mockResolvedValue(null)
    await expect(readTrainingPersonalChangesAvailability('attempt', 'student')).resolves.toEqual({ configured: false })
  })
  it('hides action for inactive creator or unpublished source', async () => {
    mocks.attempt.mockResolvedValueOnce(configuredAttempt)
      .mockResolvedValueOnce({ ...configuredAttempt, compositeAssessment: { ...configuredAttempt.compositeAssessment, status: 'DRAFT' } })
    mocks.user.mockResolvedValueOnce({ ...activeUser, isActive: false }).mockResolvedValueOnce(activeUser)
    await expect(readTrainingPersonalChangesAvailability('attempt', 'student')).resolves.toEqual({ configured: false })
    await expect(readTrainingPersonalChangesAvailability('attempt', 'student')).resolves.toEqual({ configured: false })
  })
})
