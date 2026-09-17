import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '../../config/database'
import {
  createSqlRelationalAnalysisRepository,
  type RelationalCohortAnalysisSnapshotV1,
} from '../../modules/assessment-relational'

const enabled = Boolean(process.env.DATABASE_URL)
const subjectIds = new Set<string>()

const snapshot = (input: {
  subjectUserId: string
  courseId: string
  episodeId: string
  resourceVersion: string
  applicabilityHash: string
  createdAt: string
  snapshotHash: string
}): RelationalCohortAnalysisSnapshotV1 => ({
  schemaVersion: 1,
  kind: 'COHORT_AGGREGATE',
  subjectUserId: input.subjectUserId,
  courseId: input.courseId,
  episodeId: input.episodeId,
  resourceKind: 'BUNDLE',
  resourceKey: 'classroom_environment_scope_fixture_v1',
  resourceVersion: input.resourceVersion,
  applicabilityHash: input.applicabilityHash,
  minimumRespondents: 5,
  policyKey: 'classroom_environment_cohort_v1',
  policyVersion: '1.0.0',
  policyHash: 'f'.repeat(64),
  respondentCount: 5,
  inputResultHashes: Array.from({ length: 5 }, (_, index) => (index + 1).toString(16).padStart(64, '0')),
  metrics: {
    climate: { state: 'present', validN: 5, missingN: 0, mean: 3 },
  },
  createdAt: input.createdAt,
  snapshotHash: input.snapshotHash,
})

afterEach(async () => {
  if (!enabled) return
  if (subjectIds.size > 0) {
    await prisma.relationalAnalysisSnapshot.deleteMany({
      where: { subjectUserId: { in: [...subjectIds] } },
    })
    await prisma.user.deleteMany({ where: { id: { in: [...subjectIds] } } })
  }
  subjectIds.clear()
})

describe.skipIf(!enabled)('relational analysis repository persistence', () => {
  it('reads the latest cohort only within the exact teacher/course/episode/resource/applicability scope', async () => {
    const suffix = randomUUID()
    const teacher = await prisma.user.create({
      data: {
        username: `rel-analysis-teacher-${suffix}`,
        passwordHash: 'test',
        role: 'TEACHER',
      },
    })
    subjectIds.add(teacher.id)

    const repository = createSqlRelationalAnalysisRepository(prisma as any)
    const applicabilityV1 = 'a'.repeat(64)
    const applicabilityV2 = 'b'.repeat(64)

    const courseOne = snapshot({
      subjectUserId: teacher.id,
      courseId: 'course-1',
      episodeId: 'episode-1',
      resourceVersion: '1.0.0',
      applicabilityHash: applicabilityV1,
      createdAt: '2026-09-17T03:00:00.000Z',
      snapshotHash: '1'.repeat(64),
    })
    const courseTwoNewer = snapshot({
      subjectUserId: teacher.id,
      courseId: 'course-2',
      episodeId: 'episode-2',
      resourceVersion: '1.0.0',
      applicabilityHash: applicabilityV1,
      createdAt: '2026-09-17T04:00:00.000Z',
      snapshotHash: '2'.repeat(64),
    })
    const courseOneNewVersionNewest = snapshot({
      subjectUserId: teacher.id,
      courseId: 'course-1',
      episodeId: 'episode-1',
      resourceVersion: '2.0.0',
      applicabilityHash: applicabilityV2,
      createdAt: '2026-09-17T05:00:00.000Z',
      snapshotHash: '3'.repeat(64),
    })

    await repository.saveCohort(courseOne)
    await repository.saveCohort(courseTwoNewer)
    await repository.saveCohort(courseOneNewVersionNewest)

    const resolvedCourseOne = await repository.latestCohort({
      subjectUserId: teacher.id,
      courseId: 'course-1',
      episodeId: 'episode-1',
      resourceKind: 'BUNDLE',
      resourceKey: 'classroom_environment_scope_fixture_v1',
      resourceVersion: '1.0.0',
      applicabilityHash: applicabilityV1,
    })
    expect(resolvedCourseOne?.snapshotHash).toBe(courseOne.snapshotHash)

    const resolvedCourseTwo = await repository.latestCohort({
      subjectUserId: teacher.id,
      courseId: 'course-2',
      episodeId: 'episode-2',
      resourceKind: 'BUNDLE',
      resourceKey: 'classroom_environment_scope_fixture_v1',
      resourceVersion: '1.0.0',
      applicabilityHash: applicabilityV1,
    })
    expect(resolvedCourseTwo?.snapshotHash).toBe(courseTwoNewer.snapshotHash)

    const wrongApplicability = await repository.latestCohort({
      subjectUserId: teacher.id,
      courseId: 'course-1',
      episodeId: 'episode-1',
      resourceKind: 'BUNDLE',
      resourceKey: 'classroom_environment_scope_fixture_v1',
      resourceVersion: '1.0.0',
      applicabilityHash: applicabilityV2,
    })
    expect(wrongApplicability).toBeNull()
  })
})
