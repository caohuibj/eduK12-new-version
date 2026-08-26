import { Request, Response, NextFunction } from 'express'
import { prisma } from '../config/database'
import { UserRole } from '../types'
import { forbidden, notFound, unauthorized } from '../utils/response'

export interface ClassroomAccessRecord {
  id: string
  courseId: string
  creatorId: string
  status: string
  course: {
    creatorId: string
  }
}

/**
 * Return only the ownership fields needed for classroom authorization.
 *
 * Course shares grant reusable course-content access. They do not grant
 * access to a classroom's roster, identities, answers, or live controls.
 * Classroom managers are administrators, the classroom creator, and the
 * course creator.
 */
export async function findClassroomAccess(
  classroomId: string
): Promise<ClassroomAccessRecord | null> {
  return prisma.classroom.findUnique({
    where: { id: classroomId },
    select: {
      id: true,
      courseId: true,
      creatorId: true,
      status: true,
      course: {
        select: {
          creatorId: true,
        },
      },
    },
  }) as Promise<ClassroomAccessRecord | null>
}

export function canManageClassroom(
  classroom: ClassroomAccessRecord,
  userId: string | undefined,
  role: UserRole | undefined
): boolean {
  if (role === UserRole.ADMIN) {
    return true
  }

  if (!userId || role !== UserRole.TEACHER) {
    return false
  }

  return (
    classroom.creatorId === userId ||
    classroom.course.creatorId === userId
  )
}

export async function userCanManageClassroom(
  classroomId: string,
  userId: string | undefined,
  role: UserRole | undefined
): Promise<boolean> {
  if (!userId) {
    return false
  }

  const classroom = await findClassroomAccess(classroomId)
  return !!classroom && canManageClassroom(classroom, userId, role)
}

/**
 * Protect any route whose resource is a classroom or a classroom-owned child.
 * Missing authentication is deliberately distinguished from a resource-level
 * permission failure so callers receive 401 vs 403 consistently.
 */
export const requireClassroomManager = (paramName: string = 'id') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return unauthorized(res)
      }

      const classroomId = req.params[paramName]
      if (!classroomId) {
        return notFound(res, '课堂不存在')
      }

      const classroom = await findClassroomAccess(classroomId)
      if (!classroom) {
        return notFound(res, '课堂不存在')
      }

      if (!canManageClassroom(classroom, req.user.userId, req.user.role)) {
        return forbidden(res, '无权限访问此课堂')
      }

      return next()
    } catch (error) {
      return next(error)
    }
  }
}
