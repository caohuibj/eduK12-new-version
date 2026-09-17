import type { UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { relationalFail } from './errors'

const displayName = (user: { nickname: string | null; username: string }): string => (
  user.nickname?.trim() || user.username
)

export const createRelationalProductContextService = (db: any = prisma) => ({
  async parentChildren(input: { userId: string; role: UserRole }) {
    if (input.role !== 'PARENT') {
      relationalFail('RELATIONAL_ASSIGNMENT_ACTOR', 'only a parent can read bound children')
    }
    const relationships = await db.parentStudentRelationship.findMany({
      where: { parentUserId: input.userId, status: 'ACTIVE' },
      orderBy: { approvedAt: 'asc' },
      select: {
        studentUserId: true,
        student: { select: { username: true, nickname: true } },
      },
    })
    return relationships.map((relationship: any) => ({
      studentUserId: relationship.studentUserId,
      displayName: displayName(relationship.student),
    }))
  },

  async teacherRoster(input: { userId: string; role: UserRole; courseId: string }) {
    if (input.role !== 'TEACHER') {
      relationalFail('RELATIONAL_ASSIGNMENT_ACTOR', 'only a teacher can read relational course roster')
    }
    const course = await db.course.findUnique({
      where: { id: input.courseId },
      select: { id: true, title: true, creatorId: true },
    })
    if (!course) relationalFail('RELATIONAL_COURSE_NOT_FOUND', 'course not found')
    if (course.creatorId !== input.userId) {
      relationalFail('RELATIONAL_COURSE_TEACHER', 'teacher must be the course creator')
    }
    const memberships = await db.courseStudent.findMany({
      where: {
        courseId: input.courseId,
        status: { in: ['ACTIVE', 'APPROVED'] },
      },
      orderBy: { joinedAt: 'asc' },
      select: {
        studentId: true,
        student: { select: { username: true, nickname: true } },
      },
    })
    const studentIds = memberships.map((membership: any) => membership.studentId)
    const relationships = studentIds.length
      ? await db.parentStudentRelationship.findMany({
        where: { studentUserId: { in: studentIds }, status: 'ACTIVE' },
        select: {
          studentUserId: true,
          parentUserId: true,
          parent: { select: { username: true, nickname: true } },
        },
      })
      : []
    const parentsByStudent = new Map<string, Array<{ parentUserId: string; displayName: string }>>()
    for (const relationship of relationships as any[]) {
      const list = parentsByStudent.get(relationship.studentUserId) ?? []
      list.push({
        parentUserId: relationship.parentUserId,
        displayName: displayName(relationship.parent),
      })
      parentsByStudent.set(relationship.studentUserId, list)
    }
    return {
      courseId: course.id,
      title: course.title,
      roster: memberships.map((membership: any) => ({
        studentUserId: membership.studentId,
        displayName: displayName(membership.student),
        approvedParents: parentsByStudent.get(membership.studentId) ?? [],
      })),
    }
  },

  async studentCourses(input: { userId: string; role: UserRole }) {
    if (input.role !== 'STUDENT') {
      relationalFail('RELATIONAL_ASSIGNMENT_ACTOR', 'only a student can read relational course context')
    }
    const memberships = await db.courseStudent.findMany({
      where: {
        studentId: input.userId,
        status: { in: ['ACTIVE', 'APPROVED'] },
      },
      orderBy: { joinedAt: 'asc' },
      select: {
        course: {
          select: {
            id: true,
            title: true,
            creator: { select: { id: true, username: true, nickname: true } },
          },
        },
      },
    })
    return memberships.map((membership: any) => ({
      courseId: membership.course.id,
      title: membership.course.title,
      teacher: {
        userId: membership.course.creator.id,
        displayName: displayName(membership.course.creator),
      },
    }))
  },
})

export const relationalProductContextService = createRelationalProductContextService()
