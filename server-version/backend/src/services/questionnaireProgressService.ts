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

  if (qa.status === 'COMPLETED') {
    return {
      status: qa.status,
      progress: qa.progress,
      completedScales,
      completedForms,
      completed: true,
      completedAt: qa.completedAt,
      totalTime: qa.totalTime,
      collectionReport: buildQuestionnaireCollectionReport(qa),
    }
  }

  if (!completed) {
    await db.questionnaireAssessment.updateMany({
      where: { id: questionnaireAssessmentId, status: 'IN_PROGRESS' },
      data: {
        completedScales,
        completedForms,
        progress,
      },
    })

    return {
      status: 'IN_PROGRESS',
      progress,
      completedScales,
      completedForms,
      completed: false,
      completedAt: null,
      totalTime: null,
      collectionReport: null,
    }
  }

  const collectionReport = buildQuestionnaireCollectionReport(qa)
  const completedAt = new Date()
  const totalTime = completedAt.getTime() - new Date(qa.startedAt).getTime()

  await db.questionnaireAssessment.updateMany({
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
