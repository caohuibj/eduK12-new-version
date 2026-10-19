import { Prisma } from '@prisma/client'
import { compositeBadRequest } from '../composite/composite.errors'

/** Only explicit new Training questionnaire configurations use this gate.
 * Callers keep historical null definitions on their unchanged path. The
 * parent definition lock must be held before this function is called. */
export async function assertTrainingVariantAuthoringScope(tx: Prisma.TransactionClient, row: any): Promise<void> {
  if (row.productKind !== 'QUESTIONNAIRE' || row.questionnaireType !== 'COURSE'
    || row.reportPackageKey || row.analysisProtocolKey || row.bundleInstance
    || row.deliveryPolicy || row.selectionPolicy || row.routingPolicy || row.randomizationPolicy
    || row.assignmentRef || row.anonymousStudy || row.anonymousStudyId
    || row.trainingFlowDraft != null || row.trainingFlowFrozen != null || row.trainingFlowDigest != null
    || typeof row.createdBy !== 'string' || !row.createdBy) {
    throw compositeBadRequest('加权随机分组仅支持 Training 课程普通问卷，不能组合跨工具流程、报告包、研究波次或其他投放策略')
  }
  if (!Number.isInteger(row.maxAttempts) || row.maxAttempts < 1 || row.maxAttempts > 100) {
    throw compositeBadRequest('加权随机分组的每人作答次数必须为 1–100 次；取消作答也消耗一次')
  }
  const ids = (row.questionnaireCourses ?? []).map((entry: any) => entry.courseId)
  if (!ids.length || ids.length > 100 || ids.some((id: unknown) => typeof id !== 'string' || !id)
    || new Set(ids).size !== ids.length) {
    throw compositeBadRequest('加权随机分组必须明确绑定真实 Training 投放课程')
  }
  if (row.publicEnabled && ids.length !== 1) {
    throw compositeBadRequest('公开加权随机问卷必须唯一绑定一个 Training 投放课程')
  }
  // Match C13's parent → user → course → release/grant/asset lock order.
  await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id=${row.createdBy} FOR SHARE`)
  // The course rows share C13's stable course ordering.
  // Read the locked source, never an HTTP host or a client-supplied course type.
  const facts = await tx.$queryRaw<Array<{ id: string; courseType: string; isLibrary: boolean }>>(Prisma.sql`
    SELECT id, course_type AS "courseType", is_library AS "isLibrary" FROM courses
    WHERE id IN (${Prisma.join([...ids].sort())}) ORDER BY id FOR SHARE
  `)
  if (facts.length !== ids.length || facts.some(course => course.courseType !== 'TRAINING_COURSE' || course.isLibrary)) {
    throw compositeBadRequest('加权随机分组仅支持非库的真实 Training 课程')
  }
  if (row.id) {
    const waves = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT w.id FROM anonymous_study_waves w
      JOIN composite_assessment_access_tokens t ON t.id=w.access_token_id
      WHERE t.composite_assessment_id=${row.id} LIMIT 1
    `
    if (waves.length) throw compositeBadRequest('加权随机分组暂不能与匿名研究波次组合')
  }
}
