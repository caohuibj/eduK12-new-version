import type { UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { relationalFail } from './errors'
import { createSqlRelationalAssignmentRepository } from './repository'

export const createRelationalProductReportService = (db: any = prisma) => ({
  async respondentReportTarget(input: {
    assignmentId: string
    userId: string
    role: UserRole
  }): Promise<{ attemptId: string }> {
    if (input.role !== 'STUDENT' && input.role !== 'PARENT' && input.role !== 'TEACHER') {
      relationalFail('RELATIONAL_PRODUCT_ROLE', 'this account role cannot read a relational respondent report')
    }
    const repository = createSqlRelationalAssignmentRepository(db as any)
    const assignment = await repository.findById(input.assignmentId)
      ?? relationalFail('RELATIONAL_ASSIGNMENT_NOT_FOUND', 'assignment not found')
    if (assignment.respondentUserId !== input.userId || assignment.respondentRole !== input.role) {
      relationalFail('RELATIONAL_ANALYSIS_ACCESS', 'only the assignment respondent can open this report target')
    }
    if (assignment.status !== 'COMPLETED') {
      relationalFail('RELATIONAL_REPORT_NOT_READY', 'assignment is not completed')
    }
    const attempt = await db.compositeAssessmentAttempt.findFirst({
      where: {
        assignmentRef: assignment.assignmentId,
        userId: input.userId,
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        subjectUserId: true,
        respondentUserId: true,
        episodeId: true,
        assignmentRef: true,
      },
    })
    if (!attempt) relationalFail('RELATIONAL_REPORT_NOT_READY', 'completed runtime attempt not found')
    if (
      attempt.subjectUserId !== assignment.subjectUserId
      || attempt.respondentUserId !== assignment.respondentUserId
      || attempt.episodeId !== assignment.episodeId
      || attempt.assignmentRef !== assignment.assignmentId
    ) {
      relationalFail('RELATIONAL_RUNTIME_BINDING', 'runtime report target does not match the relational assignment')
    }
    return { attemptId: attempt.id }
  },
})

export const relationalProductReportService = createRelationalProductReportService()
