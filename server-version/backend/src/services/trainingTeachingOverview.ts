import { prisma } from '../config/database'

export type TeachingOverviewQuery = { page: number; pageSize: number; includeCourseCounts?: boolean }

/** Course-owner metadata only. Shared content never grants access to submissions. */
export async function listTrainingTeachingOverview(userId: string, query: TeachingOverviewQuery) {
  const courseWhere = { creatorId: userId, isLibrary: false, courseType: { not: 'CAMPUS_ACTIVITY' } }
  const [courseCounts, pending] = await Promise.all([
    query.includeCourseCounts === false ? null : prisma.course.groupBy({ by: ['status'], where: courseWhere, _count: { _all: true } }),
    prisma.submission.groupBy({
      by: ['assignmentId'],
      where: { status: 'SUBMITTED', assignment: { course: courseWhere } },
      _count: { _all: true },
      _min: { submittedAt: true },
      orderBy: [{ _min: { submittedAt: 'asc' } }, { assignmentId: 'asc' }],
    }),
  ])
  const pageRows = pending.slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
  const assignments = pageRows.length ? await prisma.assignment.findMany({
    // Recheck the same owner boundary when resolving paginated titles.
    where: { id: { in: pageRows.map(row => row.assignmentId) }, course: courseWhere },
    select: { id: true, title: true, courseId: true, course: { select: { id: true, title: true } } },
  }) : []
  const byId = new Map(assignments.map(row => [row.id, row]))
  return {
    summary: {
      pendingSubmissions: pending.reduce((sum, row) => sum + row._count._all, 0),
      pendingAssignments: pending.length,
      ...(courseCounts ? {
        courses: courseCounts.reduce((sum, row) => sum + row._count._all, 0),
        publishedCourses: courseCounts.find(row => row.status === 'PUBLISHED')?._count._all ?? 0,
      } : {}),
    },
    list: pageRows.flatMap(row => {
      const assignment = byId.get(row.assignmentId)
      if (!assignment) return []
      const params = new URLSearchParams({ section: 'assignments', assignmentId: assignment.id })
      return [{
        id: assignment.id, title: assignment.title, course: assignment.course,
        pendingCount: row._count._all, oldestSubmittedAt: row._min.submittedAt?.toISOString() ?? null,
        href: '/courses/' + encodeURIComponent(assignment.courseId) + '/detail?' + params,
      }]
    }),
    total: pending.length, page: query.page, pageSize: query.pageSize,
  }
}
