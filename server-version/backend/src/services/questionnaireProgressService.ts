import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'
import { buildQuestionnaireCollectionReport, collectionReportForStorage } from '../modules/reporting/questionnaire-collection-report'

type DatabaseClient = typeof prisma | Prisma.TransactionClient

const questionnaireProgressInclude = {
  questionnaire: {
    include: {
      formItems: {
        orderBy: { position: 'asc' as const },
      },
      questionnaireScales: {
        include: {
          scale: {
            include: {
              dimensions: true,
            },
          },
        },
        orderBy: { position: 'asc' as const },
      },
    },
  },
  scaleAssessments: {
    include: {
      scale: {
        include: {
          dimensions: true,
        },
      },
    },
  },
  formAnswers: true,
} as const

export type QuestionnaireProgressResult = {
  status: string
  progress: number
  completedScales: number
  completedForms: number
  completed: boolean
  completedAt: Date | null
  totalTime: number | null
  collectionReport: any | null
}

/**
 * Recomputes cached questionnaire progress from child rows and performs the
 * final state transition conditionally.  This function must be called from a
 * serializable transaction when it follows a child completion/write.
 */
export const refreshQuestionnaireProgress = async (
  db: DatabaseClient,
  questionnaireAssessmentId: string,
): Promise<QuestionnaireProgressResult | null> => {
  const qa = await db.questionnaireAssessment.findUnique({
    where: { id: questionnaireAssessmentId },
    include: questionnaireProgressInclude,
  })

  if (!qa) return null

  const scaleIds = new Set(qa.questionnaire.questionnaireScales.map((item) => item.scaleId))
  const formItemIds = new Set(qa.questionnaire.formItems.map((item) => item.id))
  const completedScales = qa.scaleAssessments.filter(
    (assessment) => scaleIds.has(assessment.scaleId) && assessment.status === 'COMPLETED',
  ).length
  const completedForms = qa.formAnswers.filter((answer) => formItemIds.has(answer.formItemId)).length
  const totalItems = scaleIds.size + formItemIds.size
  const completedItems = completedScales + completedForms
  const progress = totalItems === 0 ? 100 : Math.min(100, Math.round((completedItems / totalItems) * 100))
  const completed = completedItems >= totalItems

  const resultFor = (row: typeof qa, isCompleted: boolean, completedAt: Date | null, totalTime: number | null, collectionReport: any | null): QuestionnaireProgressResult => ({
    status: row.status,
    progress: row.status === 'IN_PROGRESS' ? progress : row.progress,
    completedScales,
    completedForms,
    completed: isCompleted,
    completedAt,
    totalTime,
    collectionReport,
  })

  if (qa.status === 'COMPLETED') {
    return resultFor(qa, true, qa.completedAt, qa.totalTime, buildQuestionnaireCollectionReport(qa))
  }

  // ABANDONED and any future terminal states are database facts, not states
  // that this helper may reopen or complete as a side effect of a stale write.
  if (qa.status !== 'IN_PROGRESS') {
    return resultFor(qa, false, qa.completedAt, qa.totalTime, null)
  }

  if (!completed) {
    const updated = await db.questionnaireAssessment.updateMany({
      where: { id: questionnaireAssessmentId, status: 'IN_PROGRESS' },
      data: {
        completedScales,
        completedForms,
        progress,
      },
    })

    if (updated.count === 1) return resultFor(qa, false, null, null, null)

    const current = await db.questionnaireAssessment.findUnique({
      where: { id: questionnaireAssessmentId },
      include: questionnaireProgressInclude,
    })
    if (!current) return null
    return current.status === 'COMPLETED'
      ? resultFor(current, true, current.completedAt, current.totalTime, buildQuestionnaireCollectionReport(current))
      : resultFor(current, false, current.completedAt, current.totalTime, null)
  }

  const collectionReport = buildQuestionnaireCollectionReport(qa)
  const completedAt = new Date()
  const totalTime = completedAt.getTime() - new Date(qa.startedAt).getTime()

  const updated = await db.questionnaireAssessment.updateMany({
    where: { id: questionnaireAssessmentId, status: 'IN_PROGRESS' },
    data: {
      status: 'COMPLETED',
      completedScales,
      completedForms,
      progress: 100,
      completedAt,
      totalTime,
      aggregateReport: collectionReportForStorage(collectionReport) as any,
    },
  })

  if (updated.count === 1) {
    return {
      status: 'COMPLETED',
      progress: 100,
      completedScales,
      completedForms,
      completed: true,
      completedAt,
      totalTime,
      collectionReport,
    }
  }

  // Another serializable transaction won the completion race. Return its
  // persisted result rather than inventing a second completion timestamp or
  // report in the caller.
  const current = await db.questionnaireAssessment.findUnique({
    where: { id: questionnaireAssessmentId },
    include: questionnaireProgressInclude,
  })
  if (!current) return null
  if (current.status === 'COMPLETED') {
    return resultFor(current, true, current.completedAt, current.totalTime, buildQuestionnaireCollectionReport(current))
  }
  return resultFor(current, false, current.completedAt, current.totalTime, null)
}

/** Run a mutation at serializable isolation and retry PostgreSQL conflicts. */
export const withSerializableQuestionnaireTransaction = async <T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => {
  const maxAttempts = 3

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    } catch (err: any) {
      if (err?.code !== 'P2034' || attempt === maxAttempts) throw err
    }
  }

  throw new Error('questionnaire transaction retry exhausted')
}
