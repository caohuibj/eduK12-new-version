import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { compileTrainingFlow, parseTrainingFlowDraft, TrainingFlowError, trainingFlowItemKey, trainingFlowUnitKey, type TrainingFlowDraft } from '../assessment-core/flow/training'
import type { FlowCondition } from '../assessment-core/flow/definition'
import { buildTrainingFlowUnits } from '../composite/training-flow-definition'
import { compositeBadRequest } from '../composite/composite.errors'

export const hasTrainingFlowDefinition = (row: any): boolean => row.trainingFlowDraft != null || row.trainingFlowFrozen != null || row.trainingFlowDigest != null

function flowInput<T>(read: () => T): T {
  try { return read() } catch (error) {
    if (error instanceof TrainingFlowError) throw compositeBadRequest(error.issues.map(issue => `${issue.path}: ${issue.message}`).join('; '))
    throw error
  }
}
// Run the shared bounded shape parser before any recursive Zod traversal.
export const trainingFlowSchema = z.object({ revision: z.number().int().nonnegative(), maxAttempts:z.number().int().min(1).max(100).optional(),
  config: z.unknown().transform(value => value === null ? null : flowInput(() => parseTrainingFlowDraft(value))),
}).strict()

/** Caller holds the definition lock. Only explicit new configurations enter
 * this scope; historical null questionnaires keep their existing behavior. */
export async function assertTrainingFlowAuthoringScope(tx: Prisma.TransactionClient, row: any): Promise<void> {
  if (row.productKind !== 'QUESTIONNAIRE' || row.questionnaireType !== 'COURSE'
    || row.reportPackageKey != null || row.analysisProtocolKey != null || row.bundleInstance != null
    || row.deliveryPolicy != null || row.selectionPolicy != null || row.routingPolicy != null || row.randomizationPolicy != null
    || row.assignmentRef != null || row.anonymousStudy != null || row.anonymousStudyId != null
    || row.trainingVariantDraft != null || row.trainingVariantFrozen != null || row.trainingVariantDigest != null
    || typeof row.createdBy !== 'string' || !row.createdBy) {
    throw compositeBadRequest('跨工具流程仅支持 Training 课程普通问卷，暂不能组合概率分卷、报告包、关系测评、匿名研究或其他投放策略')
  }
  if((row.trainingFlowDraft?.schemaVersion===2||row.trainingFlowFrozen?.schemaVersion===2)&&(!Number.isInteger(row.maxAttempts)||row.maxAttempts<1||row.maxAttempts>100))throw compositeBadRequest('材料实验必须明确设置1–100次作答预算')
  const ids = (row.questionnaireCourses ?? []).map((entry: any) => entry.courseId)
  if (!ids.length || ids.length > 100 || ids.some((id: unknown) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
    throw compositeBadRequest('跨工具流程必须明确绑定真实 Training 投放课程')
  }
  if (row.publicEnabled && ids.length !== 1) throw compositeBadRequest('公开跨工具流程必须唯一绑定一个 Training 投放课程')
  await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id=${row.createdBy} FOR SHARE`)
  const facts = await tx.$queryRaw<Array<{ id: string; courseType: string; isLibrary: boolean }>>(Prisma.sql`
    SELECT id, course_type AS "courseType", is_library AS "isLibrary" FROM courses
    WHERE id IN (${Prisma.join([...ids].sort())}) ORDER BY id FOR SHARE
  `)
  if (facts.length !== ids.length || facts.some(course => course.courseType !== 'TRAINING_COURSE' || course.isLibrary)) {
    throw compositeBadRequest('跨工具流程仅支持非库的真实 Training 课程')
  }
  if (row.id) {
    const waves = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT w.id FROM anonymous_study_waves w
      JOIN composite_assessment_access_tokens t ON t.id=w.access_token_id
      WHERE t.composite_assessment_id=${row.id} LIMIT 1
    `
    if (waves.length) throw compositeBadRequest('跨工具流程暂不能与匿名研究波次组合')
    const relational = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM composite_assessment_attempts WHERE composite_assessment_id=${row.id} AND assignment_ref IS NOT NULL LIMIT 1
    `
    if (relational.length) throw compositeBadRequest('跨工具流程暂不能与关系测评组合')
  }
}

export function compileTrainingFlowDefinition(input: unknown, row: any) {
  return flowInput(() => compileTrainingFlow(input, buildTrainingFlowUnits(row)))
}

export async function validateTrainingFlow(tx: Prisma.TransactionClient, row: any) {
  if (!hasTrainingFlowDefinition(row)) return
  if (row.trainingFlowDraft == null) throw compositeBadRequest('跨工具流程草稿与冻结配置不一致')
  await assertTrainingFlowAuthoringScope(tx, row)
  return compileTrainingFlowDefinition(row.trainingFlowDraft, row)
}

/** Exact AST identity rewriting. Literal titles, bodies and option values are
 * never searched or replaced, even if they contain an old identity verbatim. */
export function remapTrainingFlowDraft(input: unknown, sectionIds: ReadonlyMap<string, string>, itemIds: ReadonlyMap<string, string>, itemKeys: ReadonlyMap<string, string>): TrainingFlowDraft {
  const flow = flowInput(() => parseTrainingFlowDraft(input))
  const instruments = new Map<string, string>([
    ...Array.from(sectionIds, ([oldId, newId]) => [trainingFlowUnitKey(oldId), trainingFlowUnitKey(newId)] as const),
    ...Array.from(itemIds, ([oldId, newId]) => [trainingFlowItemKey(oldId), trainingFlowItemKey(newId)] as const),
  ])
  const instrument = (key: string) => {
    const mapped = instruments.get(key)
    if (!mapped) throw compositeBadRequest('复制的流程引用缺少精确工具映射')
    return mapped
  }
  const condition = (value: FlowCondition): FlowCondition => {
    if ('terms' in value) return { ...value, terms: value.terms.map(condition) }
    if ('term' in value) return { ...value, term: condition(value.term) }
    if (value.field.source !== 'ANSWER') throw compositeBadRequest('Training 流程暂不支持嵌入变量')
    const itemKey = itemKeys.get(value.field.itemKey)
    if (!itemKey) throw compositeBadRequest('复制的流程引用缺少精确表单稳定键映射')
    return { ...value, field: { ...value.field, instrumentKey: instrument(value.field.instrumentKey), itemKey } }
  }
  return { ...flow, blocks: flow.blocks.map(block => ({ ...block,
    ...(block.instrumentKey !== undefined ? { instrumentKey: instrument(block.instrumentKey) } : {}),
    ...(block.when ? { when: condition(block.when) } : {}),
  })) }
}
