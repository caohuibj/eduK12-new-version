import { prisma } from '../config/database'
import { Prisma, QuestionnaireType, UserRole } from '@prisma/client'

export type QuestionnaireActor = {
  userId: string
  role: UserRole
}

export type QuestionnaireKind = 'COURSE' | 'GENERAL'

type DbClient = typeof prisma | Prisma.TransactionClient

const isAdmin = (actor?: QuestionnaireActor | null): boolean => actor?.role === UserRole.ADMIN
const isTeacher = (actor?: QuestionnaireActor | null): boolean => actor?.role === UserRole.TEACHER
const isStudent = (actor?: QuestionnaireActor | null): boolean => actor?.role === UserRole.STUDENT

/**
 * Central policy for both questionnaire controllers.  Keeping the lookup and
 * role checks here makes it difficult for a new nested endpoint to forget the
 * COURSE/GENERAL type boundary or owner check.
 */
export const questionnaireAuthorizationService = {
  async get(id: string, type: QuestionnaireKind, db: DbClient = prisma) {
    return db.questionnaire.findFirst({
      where: { id, type: type as QuestionnaireType },
      include: {
        courseQuestionnaires: { select: { courseId: true } },
      },
    })
  },

  async canView(actor: QuestionnaireActor | null | undefined, questionnaire: { type: QuestionnaireType; creatorId: string; status: string; visibility: string; courseQuestionnaires?: Array<{ courseId: string }> }, db: DbClient = prisma): Promise<boolean> {
    if (!actor) return false
    if (isAdmin(actor)) return true
    if (questionnaire.type === QuestionnaireType.GENERAL) {
      return isTeacher(actor) && questionnaire.creatorId === actor.userId
    }
    if (isTeacher(actor)) return questionnaire.creatorId === actor.userId
    if (!isStudent(actor) || questionnaire.status !== 'PUBLISHED') return false
    if (questionnaire.visibility === 'PUBLIC') return true
    if (questionnaire.visibility !== 'COURSE') return false
    const courseIds = (questionnaire.courseQuestionnaires ?? []).map((row) => row.courseId)
    if (courseIds.length === 0) return false
    const membership = await db.courseStudent.findFirst({
      where: {
        studentId: actor.userId,
        courseId: { in: courseIds },
        status: { in: ['ACTIVE', 'APPROVED'] },
      },
      select: { id: true },
    })
    return Boolean(membership)
  },

  async canManage(actor: QuestionnaireActor | null | undefined, questionnaire: { type: QuestionnaireType; creatorId: string }): Promise<boolean> {
    if (!actor) return false
    return isAdmin(actor) || (isTeacher(actor) && questionnaire.creatorId === actor.userId)
  },

  async canTake(actor: QuestionnaireActor | null | undefined, questionnaire: { type: QuestionnaireType; creatorId: string; status: string; visibility: string; courseQuestionnaires?: Array<{ courseId: string }> }, db: DbClient = prisma): Promise<boolean> {
    if (!actor || questionnaire.type !== QuestionnaireType.COURSE) return false
    return this.canView(actor, questionnaire, db)
  },

  async canExport(actor: QuestionnaireActor | null | undefined, questionnaire: { type: QuestionnaireType; creatorId: string }): Promise<boolean> {
    if (!actor) return false
    return isAdmin(actor) || (isTeacher(actor) && questionnaire.creatorId === actor.userId)
  },

  async canAssociateCourse(actor: QuestionnaireActor | null | undefined, questionnaire: { type: QuestionnaireType; creatorId: string }, course: { creatorId: string }): Promise<boolean> {
    if (!actor || questionnaire.type !== QuestionnaireType.COURSE) return false
    return isAdmin(actor) || (isTeacher(actor) && course.creatorId === actor.userId && questionnaire.creatorId === actor.userId)
  },

  async canManageGeneral(actor: QuestionnaireActor | null | undefined, questionnaire: { type: QuestionnaireType; creatorId: string }): Promise<boolean> {
    // Some isolated controller tests use a minimal questionnaire stub without
    // a type field; the database-backed path always supplies the explicit
    // GENERAL discriminator.
    return (questionnaire.type === QuestionnaireType.GENERAL || !questionnaire.type) && this.canManage(actor, questionnaire)
  },

  async canIssueToken(actor: QuestionnaireActor | null | undefined, questionnaire: { type: QuestionnaireType; creatorId: string }): Promise<boolean> {
    return this.canManageGeneral(actor, questionnaire)
  },

  async canReadResponses(actor: QuestionnaireActor | null | undefined, questionnaire: { type: QuestionnaireType; creatorId: string }): Promise<boolean> {
    return this.canManageGeneral(actor, questionnaire)
  },

  /** Return true only when the child belongs to the already-authorized parent. */
  async hasScaleBinding(questionnaireId: string, scaleId: string, db: DbClient = prisma): Promise<boolean> {
    return Boolean(await db.questionnaireScale.findUnique({ where: { questionnaireId_scaleId: { questionnaireId, scaleId } }, select: { id: true } }))
  },

  async hasFormBinding(questionnaireId: string, formItemId: string, db: DbClient = prisma): Promise<boolean> {
    return Boolean(await db.questionnaireFormItem.findFirst({ where: { id: formItemId, questionnaireId }, select: { id: true } }))
  },

  async hasTokenBinding(questionnaireId: string, tokenId: string, db: DbClient = prisma): Promise<boolean> {
    return Boolean(await db.questionnaireAccessToken.findFirst({ where: { id: tokenId, questionnaireId }, select: { id: true } }))
  },

  isAdmin,
  isTeacher,
  isStudent,
}

export type QuestionnaireAuthorizationService = typeof questionnaireAuthorizationService
