import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { summarizeGroupMetrics, type GroupMetricDefinition, type GroupMetricObservation, type TaskGroupProjection } from '../reporting/group-summary'
import { listTaskGroupArtifacts, readTaskGroupArtifact, publicTaskGroupArtifact, saveTaskGroupArtifact } from '../reporting/task-artifact'
import { authorizedProject } from './builder.service'
import { SurveyAnalyticsError } from './analytics.errors'
import { loadSurveySource, loadSurveyItemDictionary, type SurveySourceProjection } from './analytics.source'
import { rejectPooledVariants } from './analytics.variant'

const fail = (status: number, message: string): never => { throw new SurveyAnalyticsError(status, message) }
const sourceOf = (projectId: string, waveId: string) => ({ product: 'SURVEY' as const, containerId: projectId, taskId: waveId })
type Scope = { actorUserId: string; projectId: string; waveId: string }

async function authorize(db: Prisma.TransactionClient, input: Scope) {
  await authorizedProject(db, input.actorUserId, input.projectId, false)
  const wave = await db.surveyWave.findFirst({ where: { id: input.waveId, projectId: input.projectId }, select: { title: true, publicationId: true } })
  if (!wave?.publicationId) return fail(404, '此项目没有已发布的研究波次')
  return wave
}

export async function surveyGroupCatalog(input: Scope) {
  const dictionary = await loadSurveyItemDictionary({ ...input, includeGroupTools: true })
  const tools = dictionary.tools ?? []
  return { tools, ...(await prisma.$transaction(async db => {
    await authorize(db, input)
    return { artifacts: await listTaskGroupArtifacts(db, sourceOf(input.projectId, input.waveId)) }
  })) }
}

/** Pure adapter: select one frozen slot before looking at metric keys. */
export function surveyGroupFacts(source: SurveySourceProjection, instrumentKey: string) {
  const tool = source.groupTools?.find(unit => unit.instrumentKey === instrumentKey)
  if (!tool) return fail(404, '请选择当前冻结问卷中的工具')
  const definitions: GroupMetricDefinition[] = []
  const observations: GroupMetricObservation[] = []
  if (tool.kind === 'FORM') {
    for (const item of source.codebook.filter(row => row.instrumentKey === instrumentKey && row.kind === 'FORM')) {
      const type = ['NUMBER', 'SLIDER'].includes(item.responseType) ? 'NUMBER'
        : ['SINGLE', 'LIKERT', 'MATRIX'].includes(item.responseType) ? 'SINGLE'
          : ['MULTIPLE', 'MATRIX_MULTIPLE'].includes(item.responseType) ? 'MULTIPLE' : null
      if (!type) continue
      definitions.push({ key: item.itemKey, label: item.prompt, type, unit: null, range: null,
        measurement: { definitionDigest: item.definitionDigest, responseType: item.responseType, instrumentKey },
        ...(type !== 'NUMBER' ? { options: item.options.filter(option => !option.nonanswerReason).map(option => ({ value: option.code, label: option.label })) } : {}) })
      for (const row of source.raw.filter(row => row.instrumentKey === instrumentKey && row.columnKey === item.columnKey)) {
        let value: GroupMetricObservation['value'] = row.value
        if (type === 'MULTIPLE' && typeof value === 'string') value = JSON.parse(value) as string[]
        observations.push({ parentId: row.attemptId, metricKey: item.itemKey, value, missingReason: row.missingReason, quality: null })
      }
    }
  } else {
    for (const column of source.scoreColumns.filter(row => row.measurement.instrumentKey === instrumentKey)) {
      const measurement = column.measurement
      const scores = source.scores.filter(row => row.measurement.instrumentKey === instrumentKey && row.measurement.scoreKey === measurement.scoreKey)
      if (scores.some(row => canonicalHash(row.measurement) !== canonicalHash(measurement)))
        return fail(409, '同一工具包含不同测量版本，不能混合统计')
      const ranges = scores.flatMap(row => row.metricDetails?.range ? [row.metricDetails.range] : [])
      const descriptor = tool.metrics?.find(metric => metric.key === measurement.scoreKey)
      const range = descriptor?.range ?? (ranges.length && ranges.every(value => canonicalHash(value) === canonicalHash(ranges[0])) ? ranges[0] : null)
      definitions.push({ key: measurement.scoreKey, label: descriptor?.label ?? measurement.scoreKey, type: 'NUMBER', unit: measurement.unit, range, measurement })
      for (const row of scores) observations.push({ parentId: row.attemptId, metricKey: measurement.scoreKey,
        value: row.value, missingReason: row.missingReason || (['not_calculable', 'NOT_CALCULABLE'].includes(row.status ?? '') ? 'NOT_CALCULABLE' : null), quality: row.quality?.status ?? null })
    }
  }
  return { tool, definitions, observations }
}

export async function generateSurveyGroupReport(input: Scope & { instrumentKey: string }) {
  const dictionary = await loadSurveyItemDictionary({ ...input, includeGroupTools: true })
  const selectedTool = dictionary.tools?.find(tool => tool.instrumentKey === input.instrumentKey)
  if (!selectedTool) return fail(404, '请选择当前冻结问卷中的工具')
  let source: SurveySourceProjection | undefined
  let afterFinal: { id: string; completedAt: Date } | undefined
  const parents: NonNullable<SurveySourceProjection['groupParents']> = []
  const scores: SurveySourceProjection['scores'] = [], raw: SurveySourceProjection['raw'] = []
  for (let page = 0; page < 30; page++) {
    const chunk = await loadSurveySource({ ...input, waveIds: [input.waveId], maxFinals: 200, pageMode: true,
      stableIdCursor: true, includeWideSchema: page === 0, includeAttendance: false, includeGroupParents: true,
      selectRaw: selectedTool.kind === 'FORM' ? { instrumentKey: input.instrumentKey } : false, selectScore: { instrumentKey: input.instrumentKey },
      afterFinal, ...(source ? { snapshotCutOff: new Date(source.cutOff), expectedSourceRevision: source.sourceRevision,
        expectedFinalCount: source.sourceFinalCount ?? undefined } : {}) })
    rejectPooledVariants(chunk)
    source ??= chunk
    parents.push(...(chunk.groupParents ?? [])); scores.push(...chunk.scores); raw.push(...chunk.raw)
    if (!chunk.nextFinalCursor) break
    if (page === 29) return fail(413, '有效答卷超过现有 6000 份分析上限，请缩小来源')
    afterFinal = { id: chunk.nextFinalCursor.id, completedAt: new Date(chunk.nextFinalCursor.completedAt) }
  }
  const frozen = source!
  if (parents.length !== frozen.sourceFinalCount || new Set(parents.map(parent => parent.attemptId)).size !== parents.length)
    return fail(409, '报告来源数量不一致，请重新生成')
  const facts = surveyGroupFacts({ ...frozen, scores, raw }, input.instrumentKey)
  return prisma.$transaction(async db => {
    const wave = await authorize(db, input)
    const current = await db.surveyProject.findUnique({ where: { id: input.projectId }, select: { revision: true } })
    if (current?.revision !== frozen.sourceRevision) return fail(409, '研究来源在生成期间变化，请重新生成')
    const projection: TaskGroupProjection = { schemaVersion: 1, descriptionVersion: 'group-descriptive-v1',
      title: facts.tool.title + ' · 群体报告', sourceLabel: wave.title, cutoff: frozen.cutOff,
      populationLabel: '本波次全部合格已完成答卷', completedN: parents.length, countUnit: 'RESPONSE', assignedN: null,
      tool: { key: input.instrumentKey, title: facts.tool.title, kind: facts.tool.kind },
      metrics: summarizeGroupMetrics(facts.definitions, facts.observations, parents.map(parent => parent.attemptId)),
      limitations: ['完成答卷数不代表去重人数；各指标使用各自有效样本。', '多选比例以该题有效作答数为分母，合计可能超过 100%。',
        '均值和样本标准差仅作描述，不代表诊断、常模或干预效果。自由文本不自动汇总。'] }
    return saveTaskGroupArtifact(db, { source: sourceOf(input.projectId, input.waveId), selector: { instrumentKey: input.instrumentKey, kind: 'ALL' },
      sourceBindings: { revision: frozen.sourceRevision, parents }, projection, generatedBy: input.actorUserId })
  })
}

export async function readSurveyGroupReport(input: Scope & { artifactId: string }) {
  return prisma.$transaction(async db => {
    await authorize(db, input)
    const artifact = await readTaskGroupArtifact(db, sourceOf(input.projectId, input.waveId), input.artifactId)
    if (!artifact) return fail(404, '群体报告不存在')
    const bindings = artifact.sourceBindings as { parents: Array<{ finalId: string; sourceFinalHash: string }> }
    // Read only frozen pointers and current withdrawal/quality state. No FINAL
    // decryption, score recomputation, or scan of newer responses on reopen.
    const rows = bindings.parents.length ? await db.surveyWaveFinal.findMany({ where: {
      projectId: input.projectId, waveId: input.waveId, id: { in: bindings.parents.map(parent => parent.finalId) },
      attempt: { status: 'COMPLETED', excludedAt: null, OR: [{ sampleReview: { is: null } }, { sampleReview: { is: { verdict: 'INCLUDED' } } }],
        AND: [{ OR: [{ participant: { is: null } }, { participant: { is: { status: { not: 'WITHDRAWN' } } } }] }] },
    }, select: { id: true, resultsHash: true } }) : []
    const hashes = new Map(rows.map(row => [row.id, row.resultsHash]))
    if (rows.length !== bindings.parents.length || bindings.parents.some(parent => hashes.get(parent.finalId) !== parent.sourceFinalHash))
      return fail(409, '原快照的纳入资格已变化，请生成更新版报告')
    return publicTaskGroupArtifact(artifact)
  })
}
