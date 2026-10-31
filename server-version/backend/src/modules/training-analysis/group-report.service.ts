import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { summarizeGroupMetrics, type GroupMetricDefinition, type GroupMetricSummary, type GroupToolKind, type TaskGroupProjection } from '../reporting/group-summary'
import { listTaskGroupArtifactsPage, type TaskArtifactCursor, publicTaskGroupArtifact, readTaskGroupArtifact, saveTaskGroupArtifact } from '../reporting/task-artifact'
import { TRAINING_ANALYSIS_MINIMUM_N } from './core'
import { assertTrainingGroupAccess, listTrainingAnalysisSources, listTrainingGroupTasksPage, loadTrainingAnalysisSources, trainingGroupSnapshotHash, trainingParticipantIdentities, type TrainingAnalysisActor, type TrainingAnalysisManifestAttemptV1 } from './source'
import { readTrainingAnalysisQuality, trainingResearchReason } from './service'
import type { TrainingAnalysisRequestV1 } from './types'
import type { TrainingGroupSource } from './group-source'

type Scope = {actor: TrainingAnalysisActor; courseId: string}
const sourceOf = (courseId: string, taskId: string) => ({product: 'TRAINING' as const, containerId: courseId, taskId})
const fail = (statusCode: number, message: string): never => {throw Object.assign(new Error(message), {statusCode, code: 'TRAINING_GROUP_REPORT_UNAVAILABLE'})}
const stale = () => fail(409, '原快照的来源或纳入资格已变化，请生成更新版报告')
const inputSchema = z.object({taskId: z.string().min(1).max(200), toolKey: z.string().min(1).max(200), publication: z.string().datetime(), configDigest: z.string().nullable(), variantKey: z.string().nullable(), materialGroupKey: z.string().min(1).max(200).optional()}).strict()

/** Keep the existing Training floor and small-complement protection. The shared
 * calculator stays policy-free; hidden cells never enter the public snapshot. */
export function trainingGroupDisclosure(metrics: GroupMetricSummary[], completedN: number): Pick<TaskGroupProjection, 'metrics' | 'completedN'> {
  const floor = TRAINING_ANALYSIS_MINIMUM_N, safe = (n: number) => n === 0 || n >= floor
  const projection = metrics.map(metric => {
    if (metric.validN < floor) return {...metric, state: 'suppressed' as const, validN: null, missingN: null, mean: null, sdSample: null, observedRange: null, frequencies: [], qualityCounts: {}}
    const distributionSuppressed = metric.frequencies.some(cell => !safe(cell.count) || !safe(metric.validN - cell.count))
    return {...metric, state: 'present' as const, missingN: safe(metric.missingN) ? metric.missingN : null,
      qualityCounts: Object.values(metric.qualityCounts).every(safe) ? metric.qualityCounts : {},
      frequencies: distributionSuppressed ? [] : metric.frequencies, ...(distributionSuppressed ? {distributionSuppressed: true} : {})}
  })
  return {metrics: projection, completedN: completedN >= floor && projection.every(metric => metric.missingN !== null) ? completedN : null}
}

async function taskHistory(tx:Prisma.TransactionClient,input:Scope&{taskId:string;before?:TaskArtifactCursor}){
 await assertTrainingGroupAccess(tx,input.actor,input.courseId,input.taskId)
 return listTaskGroupArtifactsPage(tx,sourceOf(input.courseId,input.taskId),input.before)
}
export async function trainingGroupHistory(input:Scope&{taskId:string;before?:TaskArtifactCursor}){
 return prisma.$transaction(tx=>taskHistory(tx,input),{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
}
export async function listTrainingGroupReports(input:Scope&{beforeTaskId?:string}){
 return prisma.$transaction(async tx=>{
  const page=await listTrainingGroupTasksPage(tx,input.actor,input.courseId,input.beforeTaskId)
  const taskId=page.tasks[0]?.id
  const history=taskId?await taskHistory(tx,{...input,taskId}):{artifacts:[],nextCursor:null}
  return {...page,taskId:taskId??null,...history,artifacts:history.artifacts.map(pointer=>({...pointer,taskId:taskId!}))}
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
}
export async function trainingGroupTools(input: Scope & {taskId: string}) {
  return prisma.$transaction(async tx => {
    const catalog = await listTrainingAnalysisSources(tx, input.actor, input.courseId, {authorityLock: 'SHARE', taskId: input.taskId, group: true})
    return {tools: catalog.tools, limitations: [catalog.unsupportedReason]}
  }, {isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead})
}

export type TrainingPreparedGroup={source:ReturnType<typeof sourceOf>;selector:unknown;sourceBindings:TrainingGroupBindings;projection:TaskGroupProjection;generatedBy:string;definitions:GroupMetricDefinition[];populationKeys:string[]|null}
async function computeTrainingGroupReport(tx:Prisma.TransactionClient,input:Scope,selection:z.infer<typeof inputSchema>):Promise<TrainingPreparedGroup>{

    const catalog = await listTrainingAnalysisSources(tx, input.actor, input.courseId, {authorityLock: 'SHARE', taskId: selection.taskId, group: true, groupKey: selection.toolKey})
    const tool = catalog.tools.find(tool => tool.key === selection.toolKey && tool.source.publication === selection.publication
      && tool.source.configDigest === selection.configDigest && tool.source.variantKey === selection.variantKey && tool.source.materialGroupKey === selection.materialGroupKey)
    if (!tool) return fail(404, '工具或冻结来源不存在')
    const selector: TrainingAnalysisRequestV1 = {schemaVersion: 1, courseId: input.courseId, mode: 'PAIRWISE', waves: [{waveKey: 'single', ...tool.source}]}
    const cutoff = new Date().toISOString()
    const headers = await loadTrainingAnalysisSources(tx, input.actor, selector, {authorityLock: 'SHARE', sourceCutoff: cutoff, group: {headersOnly: true}})
    const parentIds = headers.group!.parents.map(parent => parent.attemptId)
    const definitions = new Map<string, GroupMetricDefinition>(), observations: TrainingGroupSource['observations'] = [], parents: TrainingGroupSource['parents'] = [], snapshots: TrainingGroupSource['snapshots'] = [], sources: TrainingAnalysisManifestAttemptV1[] = []
    const pageSize = Math.min(200, Math.max(1, Math.floor(25000 / selector.waves[0].metrics.length)))
    for (let offset = 0; offset < parentIds.length; offset += pageSize) {
      const loaded = await loadTrainingAnalysisSources(tx, input.actor, selector, {authorityLock: 'SHARE', sourceCutoff: cutoff, group: {parentIds: parentIds.slice(offset, offset + pageSize)}})
      const group = loaded.group!, governance = new Map(loaded.researchGovernance.map(row => [row.attemptId, row]))
      const {quality} = await readTrainingAnalysisQuality(tx, input.courseId, loaded.manifest.attempts)
      const excluded = new Set(quality.filter(row => row.verdict === 'EXCLUDE').map(row => row.attemptId))
      const included = new Set(group.parents.filter(parent => !excluded.has(parent.attemptId) && !trainingResearchReason(governance.get(parent.attemptId), tool.kind)).map(parent => parent.attemptId))
      for (const definition of group.definitions) {
        const previous = definitions.get(definition.key)
        if (previous && canonicalHash(previous) !== canonicalHash(definition)) return fail(409, '同一叶指标的冻结测量定义不一致，不能混合统计')
        definitions.set(definition.key, definition)
      }
      observations.push(...group.observations.filter(row => included.has(row.parentId)))
      parents.push(...group.parents.filter(row => included.has(row.attemptId)))
      snapshots.push(...group.snapshots.filter(row => included.has(row.attemptId)))
      sources.push(...loaded.manifest.attempts.filter(row => included.has(row.attemptId)))
    }
    const metricDefinitions = tool.definitions.map(definition => definitions.get(definition.key) ?? definition)
    const disclosed = trainingGroupDisclosure(summarizeGroupMetrics(metricDefinitions, observations, parents.map(row => row.attemptId)), parents.length)
    const projection: TaskGroupProjection = {schemaVersion: 1, descriptionVersion: 'group-descriptive-v1', title: `${tool.title} · 群体报告`, sourceLabel: `${tool.source.taskName} · 发布 ${tool.source.publication}${tool.source.variantKey ? ` · 分卷 ${tool.source.variantKey}` : ''}${tool.source.materialGroupKey ? ` · 材料 ${tool.source.materialGroupKey}` : ''}`,
      cutoff, populationLabel: '本任务与所选版本全部合格已完成作答', ...disclosed, countUnit: parents.every(parent => parent.stableIdentity?.startsWith('user:')) ? 'PERSON' : 'RESPONSE', assignedN: null,
      tool: {key: tool.key, title: tool.title, kind: tool.kind as GroupToolKind}, limitations: [
        '每项指标使用各自有效样本；最新正式完成结果先确定，缺失不回退旧分数。',
        '现有 Training 最小有效样本为 5；不足样本、过小缺失单元和选项单元不披露。',
        '匿名样本只按来源内的真实绑定匹配，不推定跨研究是同一人。答卷数不等于全局去重人数；多选比例合计可能超过 100%。',
        '仅描述已有正式结果；不代表诊断、显著性或干预效果。自由文本不自动汇总。',
      ]}
    const {qualityHash} = await readTrainingAnalysisQuality(tx, input.courseId, sources)
    const includedIds = new Set(parents.map(row => row.attemptId))
    const governance = headers.researchGovernance.filter(row => includedIds.has(row.attemptId)).map(({attemptEpoch: _epoch, ...row}) => row)
    return {source:sourceOf(input.courseId,selection.taskId),selector:{kind:'ALL',...selection},sourceBindings:{parents:parents.map(({stableIdentity:_identity,...parent})=>parent),snapshots,sources,qualityHash,governanceHash:canonicalHash(governance)},projection,generatedBy:input.actor.userId,definitions:metricDefinitions,populationKeys:parents.every(p=>p.stableIdentity!==null)?parents.map(p=>p.stableIdentity!):null}
}


export async function prepareTrainingGroupReport(input:Scope&{selection:unknown}){
 const selection=inputSchema.parse(input.selection)
 return prisma.$transaction(tx=>computeTrainingGroupReport(tx,input,selection),{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:60000})
}
export async function generateTrainingGroupReport(input:Scope&{selection:unknown}){
 const selection=inputSchema.parse(input.selection)
 return prisma.$transaction(async tx=>saveTaskGroupArtifact(tx,await computeTrainingGroupReport(tx,input,selection)),{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:60000})
}
export type TrainingGroupBindings={parents:Array<Pick<TrainingGroupSource['parents'][number],'attemptId'|'attemptEpoch'>>;snapshots:TrainingGroupSource['snapshots'];sources:TrainingAnalysisManifestAttemptV1[];qualityHash:string;governanceHash:string}
export async function assertTrainingGroupBindingsCurrent(tx:Prisma.TransactionClient,input:Scope&{taskId:string},bindings:TrainingGroupBindings){
    const ids = bindings.parents.map(parent => parent.attemptId)
    // Current source membership plus original immutable slot pointers, never raw
    // result decryption or newest-FINAL discovery when reading an old version.
    const parents = ids.length ? await tx.compositeAssessmentAttempt.findMany({where: {id: {in: ids}, compositeAssessmentId: input.taskId, deliveryCourseId: input.courseId, assignmentRef: null}, select: {id: true, userId: true, assignmentRef: true, subjectUserId: true}}) : []
    if (parents.length !== ids.length) return stale()
    if (ids.length) {
      const governed = await tx.$queryRaw<Array<{id: string}>>`SELECT a.id FROM composite_assessment_attempts a JOIN assessment_run_executions e ON e.runtime_binding_kind='COMPOSITE' AND e.runtime_binding_ref=a.id JOIN assessment_run_tracks t ON t.organization_id=e.organization_id AND t.run_id=e.run_id AND t.id=e.track_id WHERE a.id IN (${Prisma.join(ids)}) AND t.frozen_resource_policy ? 'resultDisclosure' LIMIT 1`
      if (governed.length) return stale()
    }
    const snapshots = bindings.snapshots.length ? await tx.$queryRaw<Array<{compositeAttemptId: string; attemptEpoch: number; slotKey: string}>>`
      SELECT composite_attempt_id AS "compositeAttemptId",attempt_epoch AS "attemptEpoch",slot_key AS "slotKey",terminal_state AS "terminalState",payload_kind AS "payloadKind",source_type AS "sourceType",source_attempt_id AS "sourceAttemptId",source_submission_id AS "sourceSubmissionId",source_definition_hash AS "sourceDefinitionHash",completed_at AS "completedAt",md5(canonical_result_encrypted) AS "canonicalDigest",md5(collection_facts_encrypted) AS "collectionDigest"
      FROM assessment_unit_snapshots WHERE (composite_attempt_id,attempt_epoch,slot_key) IN (${Prisma.join(bindings.snapshots.map(row => Prisma.sql`(${row.attemptId},${row.attemptEpoch},${row.slotKey})`))})
    ` : []
    const hashes = new Map(snapshots.map(row => [`${row.compositeAttemptId}:${row.attemptEpoch}:${row.slotKey}`, trainingGroupSnapshotHash(row)]))
    if (hashes.size !== bindings.snapshots.length || bindings.snapshots.some(row => hashes.get(`${row.attemptId}:${row.attemptEpoch}:${row.slotKey}`) !== row.hash)) return stale()
    const {qualityHash} = await readTrainingAnalysisQuality(tx, input.courseId, bindings.sources)
    const {researchGovernance} = await trainingParticipantIdentities(tx, input.actor, parents)
    const governanceHash = canonicalHash(researchGovernance.map(({attemptEpoch: _epoch, ...row}) => row))
    if (qualityHash !== bindings.qualityHash || governanceHash !== bindings.governanceHash) return stale()
}

export async function readTrainingGroupReport(input: Scope & {taskId: string; artifactId: string}) {
  return prisma.$transaction(async tx => {
    await assertTrainingGroupAccess(tx, input.actor, input.courseId, input.taskId)
    const artifact = await readTaskGroupArtifact(tx, sourceOf(input.courseId, input.taskId), input.artifactId)
    if (!artifact) return fail(404, '群体报告不存在')
    const bindings = artifact.sourceBindings as {parents: TrainingGroupSource['parents']; snapshots: TrainingGroupSource['snapshots']; sources: TrainingAnalysisManifestAttemptV1[]; qualityHash: string; governanceHash: string}
    await assertTrainingGroupBindingsCurrent(tx,input,bindings)
    return publicTaskGroupArtifact(artifact)
  }, {isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead})
}
