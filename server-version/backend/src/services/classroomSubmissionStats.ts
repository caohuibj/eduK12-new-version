import { prisma } from '../config/database'

/** Historical answers remain visible; the live rate counts only current sessions. */
export async function classroomSubmissionStats(classroomId: string, questionId: string) {
  const [answerCount, totalSessions, activeAnswerCount] = await Promise.all([
    prisma.classroomAnswer.count({ where: { classroomId, questionId } }),
    prisma.classroomSession.count({ where: { classroomId, leftAt: null } }),
    prisma.classroomAnswer.count({ where: { classroomId, questionId, session: { leftAt: null } } }),
  ])
  return { answerCount, totalSessions, activeAnswerCount,
    submissionRate: totalSessions > 0 ? (activeAnswerCount / totalSessions) * 100 : 0 }
}
