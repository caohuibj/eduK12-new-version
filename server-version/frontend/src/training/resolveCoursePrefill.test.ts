import { beforeEach, describe, expect, it, vi } from 'vitest'
const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../api/client', () => ({ default: { get } }))
vi.mock('./context', () => ({ isTrainingHost: () => true }))
import { resolveTrainingCoursePrefill } from './resolveCoursePrefill'
const owner = 'trainer-1'
beforeEach(() => { get.mockReset() })

describe('safe course option for >100 Training courses', () => {
  it('fetches one exact, currently owned course omitted by the first picker page', async () => {
    get.mockResolvedValue({ code: 0, data: {
      id: 'course-101', title: '进阶研修', courseCode: 'UNRELATED', creatorId: owner, isLibrary: false,
    } })
    const row = await resolveTrainingCoursePrefill({ courseId: 'course-101', userId: owner, knownIds: ['course-1'] })
    expect(row?.id).toBe('course-101')
    expect(get).toHaveBeenCalledExactlyOnceWith('/courses/course-101')
  })

  it('makes no request for an already-visible course option', async () => {
    const row = await resolveTrainingCoursePrefill({ courseId: 'course-1', userId: owner, knownIds: ['course-1'] })
    expect(row).toBeNull()
    expect(get).not.toHaveBeenCalled()
  })

  it('rejects guessed other-owner, library, and malformed course identifiers', async () => {
    for (const extra of [{ creatorId: 'other', isLibrary: false }, { creatorId: owner, isLibrary: true }]) {
      get.mockResolvedValueOnce({ code: 0, data: { id: 'target', title: '其他课程', ...extra } })
      expect(await resolveTrainingCoursePrefill({ courseId: 'target', userId: owner, knownIds: [] })).toBeNull()
    }
    expect(await resolveTrainingCoursePrefill({ courseId: '../other', userId: owner, knownIds: [] })).toBeNull()
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('fails closed when the exact backend course lookup is denied', async () => {
    get.mockRejectedValueOnce(new Error('403'))
    expect(await resolveTrainingCoursePrefill({ courseId: 'mine', userId: owner, knownIds: [] })).toBeNull()
  })
})
