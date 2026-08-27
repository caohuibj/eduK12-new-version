import { Prisma } from '@prisma/client'
import {
  buildAssessmentContext,
  hashAssessmentContext,
  validateContextFormItems,
  type AssessmentContextV1,
  type ContextFormAnswer,
  type ContextFormItem,
} from '../modules/assessment-context'
import { assessmentContextHashMatches, decryptAssessmentContext, encryptAssessmentContext } from '../modules/assessment-context/security'

type DatabaseClient = typeof import('../config/database').prisma | Prisma.TransactionClient

export class AssessmentContextServiceError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message)
    this.name = 'AssessmentContextServiceError'
  }
}

export const isAssessmentContextServiceError = (value: unknown): value is AssessmentContextServiceError => value instanceof AssessmentContextServiceError

const toContextItems = (items: Array<Record<string, unknown>>): ContextFormItem[] => items.map((item) => ({
  id: String(item.id),
  type: String(item.type),
  label: typeof item.label === 'string' ? item.label : null,
  required: item.required !== false,
  position: typeof item.position === 'number' ? item.position : undefined,
  contextKey: typeof item.contextKey === 'string' ? item.contextKey : null,
  options: item.options,
}))

const toContextAnswers = (answers: Array<Record<string, unknown>>): ContextFormAnswer[] => answers.map((answer) => ({
  formItemId: String(answer.formItemId ?? answer.itemId),
  value: String(answer.value ?? ''),
}))

export const validateContextConfiguration = (items: Array<Record<string, unknown>>, measurementPositions: number[] = []) => (
  validateContextFormItems(toContextItems(items), measurementPositions)
)

const lockQuestionnaireAssessment = async (db: DatabaseClient, assessmentId: string): Promise<void> => {
  // Lightweight controller/unit-test Prisma doubles do not expose $queryRaw.
  // Real Prisma clients always do, so production transactions still acquire
  // the parent-row lock before reading or freezing the context.
  if (typeof (db as { $queryRaw?: unknown }).$queryRaw !== 'function') return
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "questionnaire_assessments"
    WHERE "id" = ${assessmentId}
    FOR UPDATE
  `
  if (!rows[0]) throw new AssessmentContextServiceError('问卷测评不存在', 404)
}

const lockCompositeAssessmentAttempt = async (db: DatabaseClient, attemptId: string): Promise<void> => {
  if (typeof (db as { $queryRaw?: unknown }).$queryRaw !== 'function') return
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "composite_assessment_attempts"
    WHERE "id" = ${attemptId}
    FOR UPDATE
  `
  if (!rows[0]) throw new AssessmentContextServiceError('综合测评记录不存在', 404)
}

const buildOrThrow = (items: Array<Record<string, unknown>>, answers: Array<Record<string, unknown>>, frozenAt: Date): AssessmentContextV1 => {
  try {
    return buildAssessmentContext({ items: toContextItems(items), answers: toContextAnswers(answers), frozenAt })
  } catch (error) {
    throw new AssessmentContextServiceError(error instanceof Error ? error.message : '人口学上下文无效', 409)
  }
}

export const freezeQuestionnaireAssessmentContext = async (
  db: DatabaseClient,
  assessmentId: string,
  frozenAt = new Date(),
): Promise<{ context: AssessmentContextV1; hash: string; alreadyFrozen: boolean }> => {
  await lockQuestionnaireAssessment(db, assessmentId)
  const assessment = await db.questionnaireAssessment.findUnique({
    where: { id: assessmentId },
    include: { questionnaire: { include: { formItems: { orderBy: { position: 'asc' } } } }, formAnswers: true },
  })
  if (!assessment) throw new AssessmentContextServiceError('问卷测评不存在', 404)
  if (assessment.contextSnapshotEncrypted && assessment.contextSnapshotHash) {
    try {
      const context = decryptAssessmentContext(assessment.contextSnapshotEncrypted)
      if (!assessmentContextHashMatches(context, assessment.contextSnapshotHash)) throw new Error('context hash mismatch')
      return { context, hash: assessment.contextSnapshotHash, alreadyFrozen: true }
    } catch {
      throw new AssessmentContextServiceError('人口学上下文无法读取，请联系管理员', 500)
    }
  }
  const context = buildOrThrow(assessment.questionnaire.formItems as unknown as Array<Record<string, unknown>>, assessment.formAnswers as unknown as Array<Record<string, unknown>>, frozenAt)
  const hash = hashAssessmentContext(context)
  const updated = await db.questionnaireAssessment.updateMany({
    where: { id: assessmentId, contextSnapshotEncrypted: null, contextSnapshotHash: null },
    data: { contextSnapshotEncrypted: encryptAssessmentContext(context), contextSnapshotHash: hash, contextFrozenAt: frozenAt },
  })
  if (updated.count === 1) return { context, hash, alreadyFrozen: false }
  const current = await db.questionnaireAssessment.findUnique({ where: { id: assessmentId } })
  if (!current?.contextSnapshotEncrypted || !current.contextSnapshotHash) throw new AssessmentContextServiceError('人口学上下文冻结失败，请重试', 409)
  try {
    const context = decryptAssessmentContext(current.contextSnapshotEncrypted)
    if (!assessmentContextHashMatches(context, current.contextSnapshotHash)) throw new Error('context hash mismatch')
    return { context, hash: current.contextSnapshotHash, alreadyFrozen: true }
  } catch {
    throw new AssessmentContextServiceError('人口学上下文无法读取，请联系管理员', 500)
  }
}

export const freezeCompositeAttemptContext = async (
  db: DatabaseClient,
  attemptId: string,
  frozenAt = new Date(),
): Promise<{ context: AssessmentContextV1; hash: string; alreadyFrozen: boolean }> => {
  await lockCompositeAssessmentAttempt(db, attemptId)
  const attempt = await db.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { compositeAssessment: { include: { items: { orderBy: { position: 'asc' } } } }, formAnswers: true },
  })
  if (!attempt) throw new AssessmentContextServiceError('综合测评记录不存在', 404)
  if (attempt.contextSnapshotEncrypted && attempt.contextSnapshotHash) {
    try {
      const context = decryptAssessmentContext(attempt.contextSnapshotEncrypted)
      if (!assessmentContextHashMatches(context, attempt.contextSnapshotHash)) throw new Error('context hash mismatch')
      return { context, hash: attempt.contextSnapshotHash, alreadyFrozen: true }
    } catch {
      throw new AssessmentContextServiceError('人口学上下文无法读取，请联系管理员', 500)
    }
  }
  const formItems = attempt.compositeAssessment.items
    .filter((item) => item.type === 'FORM')
    .map((item) => ({
      id: item.id,
      type: item.formType,
      label: item.formLabel,
      required: item.required,
      position: item.position,
      contextKey: item.contextKey,
      options: item.formOptions,
    }))
  const context = buildOrThrow(formItems, attempt.formAnswers as unknown as Array<Record<string, unknown>>, frozenAt)
  const hash = hashAssessmentContext(context)
  const updated = await db.compositeAssessmentAttempt.updateMany({
    where: { id: attemptId, contextSnapshotEncrypted: null, contextSnapshotHash: null },
    data: { contextSnapshotEncrypted: encryptAssessmentContext(context), contextSnapshotHash: hash, contextFrozenAt: frozenAt },
  })
  if (updated.count === 1) return { context, hash, alreadyFrozen: false }
  const current = await db.compositeAssessmentAttempt.findUnique({ where: { id: attemptId } })
  if (!current?.contextSnapshotEncrypted || !current.contextSnapshotHash) throw new AssessmentContextServiceError('人口学上下文冻结失败，请重试', 409)
  try {
    const context = decryptAssessmentContext(current.contextSnapshotEncrypted)
    if (!assessmentContextHashMatches(context, current.contextSnapshotHash)) throw new Error('context hash mismatch')
    return { context, hash: current.contextSnapshotHash, alreadyFrozen: true }
  } catch {
    throw new AssessmentContextServiceError('人口学上下文无法读取，请联系管理员', 500)
  }
}

export const readQuestionnaireAssessmentContext = (row: { contextSnapshotEncrypted: string | null; contextSnapshotHash: string | null }): { context: AssessmentContextV1 | null; hash: string | null; decryptError: boolean } => {
  if (!row.contextSnapshotEncrypted || !row.contextSnapshotHash) return { context: null, hash: null, decryptError: false }
  try {
    const context = decryptAssessmentContext(row.contextSnapshotEncrypted)
    if (!assessmentContextHashMatches(context, row.contextSnapshotHash)) throw new Error('context hash mismatch')
    return { context, hash: row.contextSnapshotHash, decryptError: false }
  } catch {
    return { context: null, hash: row.contextSnapshotHash, decryptError: true }
  }
}

export const readCompositeAttemptContext = readQuestionnaireAssessmentContext

export const assertContextMutable = (frozen: boolean): void => {
  if (frozen) throw new AssessmentContextServiceError('人口学表单已冻结，不能继续修改', 409)
}
