import type { PrismaClient } from '@prisma/client'
import { getCognitiveRegistryEntry } from './cognitive.registry'
import { resolveParticipantPresentation } from './participant-presentation'
import { readFrozenReport } from './profile-freeze'

interface Identity { testType: string; engineVersion: string; scoringVersion: string; configVersion: string }
type Assignment = { id: string; title: string; profile: string | null; listedStandalone: boolean; publishedAt: Date | null; resolvedReportSnapshotEncrypted: string | null; config: Identity }
type CoverageState = 'current_two_audiences' | 'historical_reading' | 'missing_snapshot' | 'unreadable_snapshot' | 'unsupported_identity' | 'original_composite_flow'

/** Inspect stored policy only; never reconstruct, rescore or change an assignment. */
export function inspectPublishedReportPolicy(assignment: Assignment) {
  const base = { assignmentId: assignment.id, title: assignment.title, ...assignment.config,
    profile: assignment.profile, publishedAt: assignment.publishedAt?.toISOString() ?? null }
  const result = (state: CoverageState, action: string, versions: { presentationVersion: string | null; reportVersion: string | null } = { presentationVersion: null, reportVersion: null }) => ({ ...base, state, ...versions, action })
  if (!assignment.listedStandalone) return result('original_composite_flow', '核验原综合/群体流程；不转为单测个体报告。')
  const identity = assignment.config
  if (!getCognitiveRegistryEntry(identity.testType, identity.engineVersion, identity.scoringVersion)) return result('unsupported_identity', '核查精确任务身份；不回退到当前其他版本。')
  if (!assignment.resolvedReportSnapshotEncrypted) return result('missing_snapshot', '保留原授权报告/导出入口；如需新版，为后续作答新建并发布任务。')
  try {
    const frozen = readFrozenReport(assignment.resolvedReportSnapshotEncrypted)!
    const presentation = frozen.participantPresentation
    const policy = presentation?.reportReading
    const versions = { presentationVersion: frozen.presentationVersion ?? null, reportVersion: policy?.version ?? null }
    if (presentation && (presentation.testType !== identity.testType || presentation.engineVersion !== identity.engineVersion || presentation.scoringVersion !== identity.scoringVersion)) throw new Error('Frozen identity mismatch')
    const current = resolveParticipantPresentation(identity)
    if (policy?.popular && policy.professional && versions.presentationVersion === current?.presentationVersion && versions.reportVersion === current?.reportReading?.version) {
      return result('current_two_audiences', '冻结策略支持两版；再验收一次完成提交、个体回读和归属教师回读。', versions)
    }
    return result('historical_reading', '继续读取历史冻结版本；为后续作答新建并发布新版任务，不改写历史结果。', versions)
  } catch {
    return result('unreadable_snapshot', '核查快照完整性；不补写、不重算、不自动迁移。')
  }
}

/** Maintenance CLI only. No API, participant/session queries or database writes. */
export async function auditPublishedCognitiveReports(db: Pick<PrismaClient, 'cognitiveTestConfig' | 'cognitiveAssignment'>, scopeLabel: string) {
  if (!scopeLabel.trim()) throw new Error('A database scope label is required')
  const configurations = await db.cognitiveTestConfig.findMany({ where: { status: 'PUBLISHED', testType: { not: 'fake' } }, orderBy: { id: 'asc' },
    select: { id: true, name: true, testType: true, engineVersion: true, scoringVersion: true, configVersion: true, accessPolicy: true } })
  const configs = configurations.map(config => {
    const entry = getCognitiveRegistryEntry(config.testType, config.engineVersion, config.scoringVersion)
    const presentation = resolveParticipantPresentation(config)
    return { ...config, supported: !!entry, declaredProfiles: entry ? Object.keys(entry.profiles) : [],
      newPublicationSupportsTwoAudiences: !!(presentation?.reportReading?.popular && presentation.reportReading.professional) }
  })
  const assignments: Array<ReturnType<typeof inspectPublishedReportPolicy>> = []
  let cursor: string | undefined
  while (true) {
    const batch = await db.cognitiveAssignment.findMany({ where: { status: 'PUBLISHED', config: { testType: { not: 'fake' } } }, orderBy: { id: 'asc' }, take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, title: true, profile: true, listedStandalone: true, publishedAt: true, resolvedReportSnapshotEncrypted: true,
        config: { select: { testType: true, engineVersion: true, scoringVersion: true, configVersion: true } } } })
    assignments.push(...batch.map(inspectPublishedReportPolicy))
    if (batch.length < 200) break
    cursor = batch[batch.length - 1].id
  }
  const counts = Object.fromEntries((['current_two_audiences', 'historical_reading', 'missing_snapshot', 'unreadable_snapshot', 'unsupported_identity', 'original_composite_flow'] as CoverageState[]).map(state => [state, assignments.filter(item => item.state === state).length]))
  const pending = assignments.filter(item => !['current_two_audiences', 'original_composite_flow'].includes(item.state)).length
  const unsupportedConfigs = configs.filter(config => !config.supported || !config.newPublicationSupportsTwoAudiences).length
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), scopeLabel, readOnly: true,
    status: !assignments.length ? 'NO_PUBLISHED_ASSIGNMENTS' : pending || unsupportedConfigs ? 'NEEDS_REVIEW' : !counts.current_two_audiences ? 'COMPOSITE_FLOW_ONLY' : 'FROZEN_POLICY_COVERED',
    summary: { publishedConfigs: configs.length, publishedAssignments: assignments.length, pendingAssignments: pending, unsupportedConfigs, counts }, configs, assignments,
    acceptance: { formalBrowserFlow: 'not_checked', historicalResultsRewritten: false, publishedLifecycleMutated: false,
      note: '覆盖结论仅描述指定数据库的发布目录和冻结策略，不代表历史结果已升级或正式浏览器流程已验收。' } }
}
